import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ThemeService } from '../../services/theme.service';
import { ContentService } from '../../services/content.service';
import { FileStorageService } from '../../services/file-storage.service';
import { BrevoEmailService } from '../../services/brevo-email.service';

@Component({
  selector: 'app-registration',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './registration.component.html',
  styleUrl: './registration.component.scss'
})
export class RegistrationComponent implements OnInit, OnDestroy {
  regState = 'gateway'; // 'gateway', 'new', 'continue_select', 'otp_verification', 'resume_success'
  activeTab: any = 'school';
  isPathModalOpen = false;
  schoolStep = 1; // 1, 2, or 3
  maxSchoolStepReached = 1;
  studentRegMode = 'group';
  selectedTrack = 'robotics';
  showAdminPaths = false;

  verificationMethod = 'email'; // 'email' | 'mobile'
  verificationInput = '';
  otpCode = '';
  otpError = '';
  resendTimer = 0;
  resendInterval: any;
  isDraftResumed = false;

  rightPanelMode = 'preview'; // 'preview' | 'list'

  // Application Tracker
  trackerQuery = '';
  trackerResult: any = null;
  trackerStatus: 'idle' | 'pending' | 'approved' | 'rejected' | 'not_found' = 'idle';
  trackerSearched = false;

  credentialsModal: {
    isOpen: boolean;
    title: string;
    subtitle: string;
    accessPass: string;
    pin: string;
    extraInfo?: string;
    nextRoute?: string;
    copiedPass: boolean;
    copiedPin: boolean;
    copiedAll: boolean;
  } | null = null;

  customAlertModal: {
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'warning' | 'info' | 'error';
  } | null = null;

  openCredentialsModal(title: string, subtitle: string, accessPass: string, pin: string, extraInfo?: string, nextRoute?: string) {
    this.credentialsModal = {
      isOpen: true,
      title,
      subtitle,
      accessPass,
      pin,
      extraInfo,
      nextRoute,
      copiedPass: false,
      copiedPin: false,
      copiedAll: false
    };
  }

  copyText(type: 'pass' | 'pin' | 'all') {
    if (!this.credentialsModal) return;
    let textToCopy = '';
    if (type === 'pass') {
      textToCopy = this.credentialsModal.accessPass;
      this.credentialsModal.copiedPass = true;
      setTimeout(() => { if (this.credentialsModal) this.credentialsModal.copiedPass = false; }, 2500);
    } else if (type === 'pin') {
      textToCopy = this.credentialsModal.pin;
      this.credentialsModal.copiedPin = true;
      setTimeout(() => { if (this.credentialsModal) this.credentialsModal.copiedPin = false; }, 2500);
    } else if (type === 'all') {
      textToCopy = `Access Pass: ${this.credentialsModal.accessPass}\nPIN: ${this.credentialsModal.pin}`;
      this.credentialsModal.copiedAll = true;
      setTimeout(() => { if (this.credentialsModal) this.credentialsModal.copiedAll = false; }, 2500);
    }
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(textToCopy);
    }
  }

  proceedFromCredentialsModal() {
    const route = this.credentialsModal?.nextRoute;
    this.credentialsModal = null;
    if (route) {
      this.router.navigate([route]);
    }
  }

  showCustomAlert(message: string, title = 'Notice', type: 'success' | 'warning' | 'info' | 'error' = 'info') {
    this.customAlertModal = {
      isOpen: true,
      title,
      message,
      type
    };
  }

  closeCustomAlert() {
    this.customAlertModal = null;
  }

  schoolForm = {
    name: '',
    category: 'Public High School',
    region: 'Greater Accra',
    district: '',
    tel: '',
    email: '',
    gps: '',
    repName: '',
    repEmail: '',
    repTel: '',
    students: [] as any[],
    teams: [] as any[],
    acceptedTerms: false
  };

  gpsLoading = false;
  gpsAddress = '';

  studentForm = {
    name: '',
    id: '',
    email: '',
    dob: '',
    gender: 'Male',
    school: '',
    class: 'Form 1',
    guardian: '',
    track: 'coding',
    skills: {
      alg: 'intermediate',
      hw: 'novice',
      ai: 'novice'
    }
  };

  teamForm = {
    name: '',
    school: 'Achimota SHS',
    track: 'Coding',
    leadName: '',
    leadEmail: '',
    member2Name: '',
    member2Email: '',
    member3Name: '',
    member3Email: '',
    member4Name: '',
    member4Email: '',
    member5Name: '',
    member5Email: ''
  };

  instructorForm = {
    name: '',
    tel: '',
    email: '',
    address: '',
    qualification: 'BSc',
    institution: '',
    isIndependent: false,
    acceptedTerms: false,
    expertise: {
      Python: false,
      JavaScript: false,
      'C#': false,
      AI: false,
      Robotics: false,
      Cybersecurity: false,
      'Data Science': false
    } as { [key: string]: boolean }
  };

  judgeForm = {
    name: '',
    tel: '',
    email: '',
    organization: '',
    expertise: '',
    experience: '',
    bio: '',
    ticketCode: '',
    otp: '',
    acceptedTerms: false
  };

  sponsorForm = {
    name: '',
    sector: 'Energy & Mining',
    repName: '',
    repContact: '',
    email: '',
    amount: '',
    tier: 'Platinum Partner (₵ 100k+)',
    acceptedTerms: false,
    arenas: {
      'Coding Track': true,
      'Robotics Arena': true,
      'AI & ML Challenge': true,
      'Cyber Security CTF': true,
      'Open Innovation': true
    } as { [key: string]: boolean }
  };

  tracks = [
    { id: 'coding', label: 'Coding', icon: 'code' },
    { id: 'robotics', label: 'Robotics', icon: 'smart_toy' },
    { id: 'ai', label: 'AI', icon: 'psychology' },
    { id: 'cyber', label: 'Cybersecurity', icon: 'security' },
    { id: 'innovation', label: 'Innovation', icon: 'tips_and_updates' },
  ];

  recentStudents = [
    { name: 'Kwame Asante', id: 'STU-0012', school: 'Achimota', track: 'coding', date: '2026-06-18' },
    { name: 'Abena Mensah', id: 'STU-0013', school: 'Wesley Girls', track: 'robotics', date: '2026-06-18' },
    { name: 'Kofi Boateng', id: 'STU-0014', school: 'Prempeh', track: 'cyber', date: '2026-06-17' },
    { name: 'Ama Darko', id: 'STU-0015', school: 'Holy Child', track: 'innovation', date: '2026-06-17' },
    { name: 'Yaw Mensah', id: 'STU-0016', school: 'PRESEC', track: 'ai', date: '2026-06-16' },
  ];

  sponsors = [
    { name: 'Tullow Ghana', tier: 'Platinum', support: 'Coding & AI', amount: '₵ 120,000', status: 'Confirmed' },
    { name: 'MTN Ghana Foundation', tier: 'Platinum', support: 'Robotics & Cyber', amount: '₵ 80,000', status: 'Confirmed' },
    { name: 'GCB Bank PLC', tier: 'Gold', support: 'Innovation Arena', amount: '₵ 40,000', status: 'Confirmed' },
  ];

  isAuthorizedUser = false;
  isPreviewModalOpen = false;
  isSuccessModalOpen = false;
  isSubmitting = false;

  selectedFileIds: { [key: string]: string[] } = {};
  selectedFileNames: { [key: string]: string[] } = {};
  schoolLogoUrl: string | null = null;

  async onFileSelected(event: any, field: string): Promise<void> {
    const files: FileList = event.target.files;
    if (files?.length) {
      const ids: string[] = [];
      const names: string[] = [];
      for (const file of Array.from(files)) {
        const id = this.fileStorage.generateId();
        await this.fileStorage.store(id, file);
        ids.push(id);
        names.push(file.name);
      }
      this.selectedFileIds[field] = [...(this.selectedFileIds[field] || []), ...ids];
      this.selectedFileNames[field] = [...(this.selectedFileNames[field] || []), ...names];

      if (field === 'schoolLogo') {
        this.loadSchoolLogo();
      }
    }
  }

  private async loadSchoolLogo(): Promise<void> {
    const id = this.selectedFileIds['schoolLogo']?.[0];
    if (id) {
      this.schoolLogoUrl = await this.fileStorage.getUrl(id);
    }
  }

  async removeFile(field: string, index: number): Promise<void> {
    const id = this.selectedFileIds[field]?.[index];
    if (id) await this.fileStorage.remove(id);
    this.selectedFileIds[field]?.splice(index, 1);
    this.selectedFileNames[field]?.splice(index, 1);
    if (field === 'schoolLogo') {
      if (this.schoolLogoUrl) { this.fileStorage.revokeUrl(this.schoolLogoUrl); }
      this.schoolLogoUrl = null;
    }
  }

  // Terms & Conditions
  acceptedTerms: { [key: string]: boolean } = {
    school: false,
    instructor: false,
    judge: false,
    sponsor: false,
    student: false
  };
  showTermsModal = false;
  showPrivacyModal = false;
  pendingTermsAction: string | null = null;

  openTermsModal(action: string): void {
    this.pendingTermsAction = action;
    this.showTermsModal = true;
  }

  closeTermsModal(): void {
    this.showTermsModal = false;
    this.pendingTermsAction = null;
  }

  acceptTerms(): void {
    if (this.pendingTermsAction) {
      this.acceptedTerms[this.pendingTermsAction] = true;
    }
    this.closeTermsModal();
  }

  openPrivacyModal(): void {
    this.showPrivacyModal = true;
  }

  closePrivacyModal(): void {
    this.showPrivacyModal = false;
  }

  constructor(private route: ActivatedRoute, private router: Router, public themeService: ThemeService, public contentService: ContentService, public fileStorage: FileStorageService, private emailService: BrevoEmailService) {}

  ngOnInit(): void {
    const activeRoleId = localStorage.getItem('activeRoleId');
    this.isAuthorizedUser = !!(activeRoleId && ['super_admin', 'school_admin', 'instructor'].includes(activeRoleId));

    this.route.queryParams.subscribe(params => {
      this.showAdminPaths = params['admin'] === 'true';
      if (params['track']) {
        this.selectedTrack = params['track'];
        this.regState = 'gateway';
        this.isPathModalOpen = true; // Open Select Registration Path popup immediately
      } else if (params['tab']) {
        this.activeTab = params['tab'] === 'student' ? 'school' : params['tab'];
        this.regState = 'new';
      } else {
        // Clicks on "Apply now" (no query parameters) always show the gateway screen first
        this.regState = 'gateway';
      }
    });
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }

  selectNewRegistration(): void {
    this.isPathModalOpen = true;
    this.clearDraftPrefills();
  }

  selectContinueRegistration(): void {
    this.regState = 'continue_select';
    this.verificationInput = '';
    this.otpCode = '';
    this.otpError = '';
  }

  openTracker(): void {
    this.regState = 'tracker';
    this.trackerQuery = '';
    this.trackerResult = null;
    this.trackerStatus = 'idle';
    this.trackerSearched = false;
  }

  searchApplication(): void {
    if (!this.trackerQuery.trim()) return;
    const result = this.contentService.lookupApplication(this.trackerQuery);
    this.trackerResult = result;
    this.trackerStatus = result.status;
    this.trackerSearched = true;
  }

  goBackToGatewayFromTracker(): void {
    this.regState = 'gateway';
    this.trackerQuery = '';
    this.trackerResult = null;
    this.trackerStatus = 'idle';
    this.trackerSearched = false;
  }

  goBackToGateway(): void {
    this.isPathModalOpen = false;
    this.regState = 'gateway';
    this.clearTimer();
  }

  setVerificationMethod(method: 'email' | 'mobile'): void {
    this.verificationMethod = method;
    this.verificationInput = '';
    this.otpError = '';
  }

  sendOTP(): void {
    if (!this.verificationInput) {
      this.otpError = this.verificationMethod === 'email'
        ? 'Please enter your registered email address.'
        : 'Please enter your registered mobile number.';
      return;
    }

    const inputKey = this.verificationInput.trim().toLowerCase();
    const drafts = JSON.parse(localStorage.getItem('ntic_drafts') || '{}');

    if (!drafts[inputKey]) {
      this.otpError = 'No saved draft found for this ' + this.verificationMethod + '. Please check and try again, or start a new registration.';
      return;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpStore = {
      code: otp,
      contact: inputKey,
      expiresAt: Date.now() + 5 * 60 * 1000
    };
    localStorage.setItem('ntic_otp', JSON.stringify(otpStore));

    this.otpError = '';
    this.otpCode = '';
    this.regState = 'otp_verification';
    this.startResendTimer();

    this.showCustomAlert(`A 6-digit verification code has been sent to ${this.verificationInput}.\n\nFor demo purposes: Your code is ${otp}`, 'Verification Code Sent', 'info');
  }

  startResendTimer(): void {
    this.resendTimer = 60;
    this.clearTimer();
    this.resendInterval = setInterval(() => {
      if (this.resendTimer > 0) {
        this.resendTimer--;
      } else {
        this.clearTimer();
      }
    }, 1000);
  }

  resendOTPCode(): void {
    const stored = JSON.parse(localStorage.getItem('ntic_otp') || 'null');
    if (stored) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      stored.code = otp;
      stored.expiresAt = Date.now() + 5 * 60 * 1000;
      localStorage.setItem('ntic_otp', JSON.stringify(stored));
      this.showCustomAlert(`New verification code sent: ${otp}`, 'Code Resent', 'info');
    }
    this.otpCode = '';
    this.otpError = '';
    this.startResendTimer();
  }

  verifyOTP(): void {
    if (this.otpCode.length !== 6) {
      this.otpError = 'Please enter the complete 6-digit code.';
      return;
    }

    const stored = JSON.parse(localStorage.getItem('ntic_otp') || 'null');

    if (!stored) {
      this.otpError = 'No verification code found. Please request a new one.';
      return;
    }

    if (Date.now() > stored.expiresAt) {
      localStorage.removeItem('ntic_otp');
      this.otpError = 'Verification code has expired. Please request a new one.';
      return;
    }

    if (this.otpCode !== stored.code) {
      this.otpError = 'Invalid verification code. Please try again.';
      return;
    }

    localStorage.removeItem('ntic_otp');
    this.otpError = '';
    this.regState = 'resume_success';
    this.clearTimer();

    setTimeout(() => {
      this.applyDraftPrefills(stored.contact);
      this.regState = 'new';
    }, 2200);
  }

  cardSubTab = 'profile'; // 'profile' | 'roster' | 'docs'

  goToStep(step: number): void {
    if (step <= this.maxSchoolStepReached) {
      this.schoolStep = step;
      this.syncCardSubTab(step);
    }
  }

  nextStep(step: number): void {
    if (step === this.schoolStep + 1) {
      this.schoolStep = step;
      if (step > this.maxSchoolStepReached) {
        this.maxSchoolStepReached = step;
      }
      this.syncCardSubTab(step);
    }
  }

  syncCardSubTab(step: number): void {
    if (step === 3) {
      this.cardSubTab = 'roster';
    } else if (step === 4) {
      this.cardSubTab = 'docs';
    } else {
      this.cardSubTab = 'profile';
    }
  }

  addStudent(): void {
    if (!this.studentForm.name) {
      this.showCustomAlert('Please enter student name.', 'Validation Error', 'warning');
      return;
    }
    this.schoolForm.students.push({
      name: this.studentForm.name,
      dob: this.studentForm.dob,
      gender: this.studentForm.gender,
      class: this.studentForm.class,
      guardian: this.studentForm.guardian,
      track: this.selectedTrack,
      skills: { ...this.studentForm.skills }
    });
    this.studentForm.name = '';
    this.studentForm.guardian = '';
  }

  removeStudent(index: number): void {
    this.schoolForm.students.splice(index, 1);
  }

  addTeam(): void {
    if (!this.teamForm.name) {
      this.showCustomAlert('Please enter team name.', 'Validation Error', 'warning');
      return;
    }
    this.schoolForm.teams.push({
      name: this.teamForm.name,
      track: this.teamForm.track,
      leadName: this.teamForm.leadName,
      leadEmail: this.teamForm.leadEmail,
      member2Name: this.teamForm.member2Name,
      member2Email: this.teamForm.member2Email,
      member3Name: this.teamForm.member3Name,
      member3Email: this.teamForm.member3Email,
      member4Name: this.teamForm.member4Name,
      member4Email: this.teamForm.member4Email,
      member5Name: this.teamForm.member5Name,
      member5Email: this.teamForm.member5Email
    });
    this.teamForm.name = '';
    this.teamForm.leadName = '';
    this.teamForm.leadEmail = '';
    this.teamForm.member2Name = '';
    this.teamForm.member2Email = '';
    this.teamForm.member3Name = '';
    this.teamForm.member3Email = '';
    this.teamForm.member4Name = '';
    this.teamForm.member4Email = '';
    this.teamForm.member5Name = '';
    this.teamForm.member5Email = '';
  }

  removeTeam(index: number): void {
    this.schoolForm.teams.splice(index, 1);
  }

  competitorMode: 'individual' | 'group' = 'group';

  registerStudent(): void {
    if (this.competitorMode === 'group') {
      if (!this.teamForm.name || !this.teamForm.leadName) {
        this.showCustomAlert('Please enter your Group / Team Name and Team Lead full name.', 'Missing Information', 'warning');
        return;
      }
      const ticket = `NTIC-GRP-${Math.floor(1000 + Math.random() * 9000)}`;
      const leadEmail = this.teamForm.leadEmail?.trim() || `${ticket.toLowerCase()}@squad.ntic.gh`;
      const found = this.contentService.users.find(u =>
        u.email?.trim().toLowerCase() === leadEmail.toLowerCase()
      );
      if (found && this.teamForm.leadEmail?.trim()) {
        this.showCustomAlert('An account with this Team Lead email already exists. Please log in instead.', 'Account Exists', 'warning');
        return;
      }
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      const membersList = [
        { name: this.teamForm.leadName, email: leadEmail, role: 'Lead' },
        ...(this.teamForm.member2Name ? [{ name: this.teamForm.member2Name, email: this.teamForm.member2Email, role: 'Member' }] : []),
        ...(this.teamForm.member3Name ? [{ name: this.teamForm.member3Name, email: this.teamForm.member3Email, role: 'Member' }] : []),
        ...(this.teamForm.member4Name ? [{ name: this.teamForm.member4Name, email: this.teamForm.member4Email, role: 'Member' }] : []),
        ...(this.teamForm.member5Name ? [{ name: this.teamForm.member5Name, email: this.teamForm.member5Email, role: 'Member' }] : [])
      ];

      const newTeam = {
        id: `TM-${Date.now()}`,
        name: this.teamForm.name,
        schoolName: this.teamForm.school || 'Independent Squad',
        track: this.teamForm.track || 'Coding',
        lead: this.teamForm.leadName,
        members: membersList.length,
        rosterList: membersList.map(m => m.name),
        status: 'Approved'
      };
      this.contentService.saveTeams([...this.contentService.teams, newTeam]);

      const newUser = {
        id: `USR-${Date.now()}`,
        role: 'student' as const,
        fullName: `${this.teamForm.leadName} (${this.teamForm.name})`,
        email: leadEmail,
        phone: '',
        otp,
        password: otp,
        organization: this.teamForm.name,
        track: this.teamForm.track || 'Coding',
        ticket,
        status: 'Active' as const,
        registeredAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        lastLogin: 'Just now'
      };
      this.contentService.users = [newUser, ...this.contentService.users];
      this.contentService.saveUsers(this.contentService.users);

      localStorage.setItem('activeRoleId', 'student');
      localStorage.setItem('activeUserEmail', leadEmail);
      this.openCredentialsModal(
        'Group Registration Successful! 🎉',
        `Your team "${this.teamForm.name}" has been registered. Copy and save your login credentials below:`,
        ticket,
        otp,
        'Use these credentials to log in to the Championship Arena.',
        '/competitions'
      );
      return;
    }

    // Individual Competitor
    if (!this.studentForm.name) {
      this.showCustomAlert('Please enter your full name to register.', 'Validation Error', 'warning');
      return;
    }
    const ticket = `NTIC-STU-${Math.floor(1000 + Math.random() * 9000)}`;
    const studentEmail = this.studentForm.email?.trim() || `${ticket.toLowerCase()}@stu.ntic.gh`;
    const found = this.contentService.users.find(u =>
      u.email?.trim().toLowerCase() === studentEmail.toLowerCase()
    );
    if (found && this.studentForm.email?.trim()) {
      this.showCustomAlert('An account with this email already exists. Please log in instead.', 'Account Exists', 'warning');
      return;
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const newUser = {
      id: `USR-${Date.now()}`,
      role: 'student' as const,
      fullName: this.studentForm.name,
      email: studentEmail,
      phone: '',
      otp,
      password: otp,
      organization: this.studentForm.school || 'Independent Competitor',
      track: this.selectedTrack,
      ticket,
      status: 'Active' as const,
      registeredAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      lastLogin: 'Just now'
    };
    this.contentService.users = [newUser, ...this.contentService.users];
    this.contentService.saveUsers(this.contentService.users);

    localStorage.setItem('activeRoleId', 'student');
    localStorage.setItem('activeUserEmail', studentEmail);
    this.openCredentialsModal(
      'Registration Successful! 🎉',
      'Your registration has been approved. Copy and save your secure login credentials below:',
      ticket,
      otp,
      'Use your Access Pass and PIN to log in from the homepage.',
      '/lms'
    );
  }

  detectGps(): void {
    if (!navigator.geolocation) {
      this.schoolForm.gps = '5.6037, -0.1870';
      this.gpsAddress = 'Accra, Greater Accra, Ghana (fallback)';
      return;
    }
    this.gpsLoading = true;
    this.gpsAddress = '';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        this.schoolForm.gps = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        this.reverseGeocode(lat, lng);
      },
      () => {
        this.schoolForm.gps = '5.6037, -0.1870';
        this.gpsAddress = 'Accra, Greater Accra, Ghana (fallback)';
        this.gpsLoading = false;
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  }

  private reverseGeocode(lat: number, lng: number): void {
    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`)
      .then(res => res.json())
      .then((data: any) => {
        const a = data.address || {};
        const parts = [a.road, a.suburb || a.neighbourhood, a.city || a.town || a.village, a.state || a.region, a.country].filter(Boolean);
        this.gpsAddress = parts.join(', ') || data.display_name || '';
        this.gpsLoading = false;
      })
      .catch(() => {
        this.gpsAddress = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        this.gpsLoading = false;
      });
  }

  getInitials(name: string, fallback: string = 'N/A'): string {
    if (!name) return fallback;
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }

  getTrackDetails(trackId: string) {
    const t = this.tracks.find(x => x.id === trackId);
    return t || { id: 'other', label: 'NTIC Track', icon: 'science' };
  }

  toggleRightPanel(mode: 'preview' | 'list'): void {
    this.rightPanelMode = mode;
  }

  hasExpertiseSelected(): boolean {
    return Object.values(this.instructorForm.expertise).some(v => v);
  }

  saveDraft(): void {
    let contact = '';
    let formData: any = null;

    switch (this.activeTab) {
      case 'school':
        contact = this.schoolForm.repEmail || this.schoolForm.email;
        formData = { ...this.schoolForm };
        break;
      case 'instructor':
        contact = this.instructorForm.email;
        formData = { ...this.instructorForm };
        break;
      case 'student':
        contact = this.studentForm.email;
        formData = { ...this.studentForm, selectedTrack: this.selectedTrack };
        break;
      case 'judge':
        contact = this.judgeForm.email;
        formData = { ...this.judgeForm };
        break;
      case 'sponsor':
        contact = this.sponsorForm.email;
        formData = { ...this.sponsorForm };
        break;
      case 'team':
        contact = this.teamForm.leadEmail;
        formData = { ...this.teamForm };
        break;
    }

    if (!contact) {
      this.showCustomAlert('Please fill in your email address before saving a draft.', 'Email Required', 'warning');
      return;
    }

    const contactKey = contact.trim().toLowerCase();
    const drafts = JSON.parse(localStorage.getItem('ntic_drafts') || '{}');
    drafts[contactKey] = {
      tab: this.activeTab,
      data: formData,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem('ntic_drafts', JSON.stringify(drafts));
    this.showCustomAlert(`Draft saved successfully! You can resume using ${contact}.`, 'Draft Saved', 'success');
  }

  generateJudgeTicket(): void {
    if (!this.judgeForm.ticketCode && this.judgeForm.name) {
      const rand = Math.floor(1000 + Math.random() * 9000);
      this.judgeForm.ticketCode = `TKN-${rand}-NTIC`;
      this.judgeForm.otp = Math.floor(100000 + Math.random() * 900000).toString();
    }
  }

  selectRolePath(role: string): void {
    this.isPathModalOpen = false;
    if (role === 'sponsor') {
      localStorage.setItem('activeRoleId', 'sponsor');
      this.router.navigate(['/sponsors']);
      return;
    }
    if (role === 'student') {
      this.activeTab = 'student';
      this.studentForm = {
        name: '',
        id: '',
        email: '',
        dob: '',
        gender: 'Male',
        school: '',
        class: 'Form 1',
        guardian: '',
        track: 'coding',
        skills: {
          alg: 'intermediate',
          hw: 'novice',
          ai: 'novice'
        }
      };
      this.regState = 'new';
      return;
    }
    this.activeTab = role;
    this.isDraftResumed = false;
    if (role === 'school') {
      this.clearDraftPrefills();
    } else if (role === 'instructor') {
      this.instructorForm = {
        name: '',
        tel: '',
        email: '',
        address: '',
        qualification: 'BSc',
        institution: '',
        isIndependent: false,
        acceptedTerms: false,
        expertise: {
          Python: false,
          JavaScript: false,
          'C#': false,
          AI: false,
          Robotics: false,
          Cybersecurity: false,
          'Data Science': false
        }
      };
    } else if (role === 'judge') {
      this.judgeForm = {
        name: '',
        tel: '',
        email: '',
        organization: '',
        expertise: '',
        experience: '',
        bio: '',
        ticketCode: '',
        otp: '',
        acceptedTerms: false
      };
    }
    this.regState = 'new';
  }

  private clearTimer(): void {
    if (this.resendInterval) {
      clearInterval(this.resendInterval);
    }
  }

  private clearDraftPrefills(): void {
    this.isDraftResumed = false;
    this.schoolStep = 1;
    this.maxSchoolStepReached = 1;
    this.gpsAddress = '';
    this.schoolForm = {
      name: '',
      category: 'Public High School',
      region: 'Greater Accra',
      district: '',
      tel: '',
      email: '',
      gps: '',
      repName: '',
      repEmail: '',
      repTel: '',
      students: [],
      teams: [],
      acceptedTerms: false
    };
  }

  private applyDraftPrefills(contact: string): void {
    const drafts = JSON.parse(localStorage.getItem('ntic_drafts') || '{}');
    const draft = drafts[contact];

    if (!draft) return;

    this.isDraftResumed = true;
    this.activeTab = draft.tab;

    switch (draft.tab) {
      case 'school':
        this.schoolStep = 1;
        this.maxSchoolStepReached = 4;
        this.schoolForm = { ...this.schoolForm, ...draft.data };
        break;
      case 'instructor':
        this.instructorForm = { ...this.instructorForm, ...draft.data };
        break;
      case 'student':
        this.studentForm = { ...this.studentForm, ...draft.data };
        this.selectedTrack = draft.data.selectedTrack || 'coding';
        break;
      case 'judge':
        this.judgeForm = { ...this.judgeForm, ...draft.data };
        break;
      case 'sponsor':
        this.sponsorForm = { ...this.sponsorForm, ...draft.data };
        break;
      case 'team':
        this.teamForm = { ...this.teamForm, ...draft.data };
        break;
    }
  }

  openPreviewModal(): void {
    if (!this.schoolForm.name) {
      this.showCustomAlert('Please fill out the form (at least the School Name) before previewing.', 'Form Incomplete', 'warning');
      return;
    }
    this.isPreviewModalOpen = true;
  }

  closePreviewModal(): void {
    this.isPreviewModalOpen = false;
  }

  async submitRegistration(): Promise<void> {
    if (this.isSubmitting) return;
    this.isSubmitting = true;

    // Capture school logo as data URL before setTimeout (needs await)
    let capturedLogo: string | null = null;
    if (this.activeTab === 'school' && this.schoolLogoUrl) {
      try {
        const logoId = this.selectedFileIds['schoolLogo']?.[0];
        if (logoId) {
          const fileData = await this.fileStorage.get(logoId);
          if (fileData) {
            capturedLogo = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(fileData.blob);
            });
          }
        }
      } catch (e) { /* logo not critical */ }
    }
    
    // Simulate API call with modern loader
    setTimeout(() => {
    try {
      this.isSubmitting = false;
      this.isPreviewModalOpen = false;

      // Add to pending approvals in localStorage via ContentService
      let approvalType: 'School Registration' | 'Team Addition' | 'Instructor Access' | null = null;
      let entity = '';
      let contact = '';
      let details: any = {};

      if (this.activeTab === 'school') {
        approvalType = 'School Registration';
        entity = this.schoolForm.name;
        contact = this.schoolForm.repEmail || this.schoolForm.email;
        details = {
          region: this.schoolForm.region,
          district: this.schoolForm.district,
          category: this.schoolForm.category,
          phone: this.schoolForm.repTel || this.schoolForm.tel,
          email: this.schoolForm.email,
          gps: this.schoolForm.gps,
          gpsAddress: this.gpsAddress,
          repName: this.schoolForm.repName,
          repEmail: this.schoolForm.repEmail,
          repTel: this.schoolForm.repTel,
          code: this.schoolForm.name.slice(0, 3).toUpperCase() + '-REG-2026',
          tracks: this.schoolForm.teams.map((t: any) => t.track).filter((value: any, index: number, self: any[]) => self.indexOf(value) === index).join(', ') || 'Coding, Robotics',
          teamsList: this.schoolForm.teams,
          studentCount: this.schoolForm.students.length,
          students: this.schoolForm.students.map((s: any) => ({ name: s.name, track: s.track, class: s.class })),
          docs: this.selectedFileIds['schoolDocs']?.length
            ? this.selectedFileIds['schoolDocs'].map((id, i) => `${id}::${this.selectedFileNames['schoolDocs']?.[i] || 'document.pdf'}`)
            : ['Accreditation_' + this.schoolForm.name.replace(/ /g, '_') + '.pdf'],
          infra: 'IT Lab facility registered, ' + this.schoolForm.students.length + ' students enrolled'
        };
        if (capturedLogo) details.logo = capturedLogo;

        // Save teams created during school registration into ContentService
        if (this.schoolForm.teams && this.schoolForm.teams.length > 0) {
          const currentTeams = [...this.contentService.teams];
          this.schoolForm.teams.forEach((t: any) => {
            const rosterList = [
              t.leadName,
              t.member2Name,
              t.member3Name,
              t.member4Name,
              t.member5Name
            ].filter(Boolean).map((n: string) => n.trim()).filter((n: string) => n.length > 0);
            
            currentTeams.push({
              name: t.name,
              track: t.track || 'Coding',
              lead: t.leadName || 'Student Captain',
              members: Math.max(rosterList.length, 3),
              rosterList: rosterList,
              status: 'In Competition',
              schoolName: this.schoolForm.name
            });
          });
          this.contentService.saveTeams(currentTeams);
        }

        // Generate user accounts for all students registered by school admin
        if (this.schoolForm.students && this.schoolForm.students.length > 0) {
          const currentUsers = [...this.contentService.users];
          this.schoolForm.students.forEach((s: any) => {
            const existingEmail = s.email || `${s.name.toLowerCase().replace(/\s+/g, '.')}@student.ntic.edu.gh`;
            if (!currentUsers.find((u: any) => u.email?.trim().toLowerCase() === existingEmail.toLowerCase())) {
              const ticket = `NTIC-STU-${Math.floor(1000 + Math.random() * 9000)}`;
              const otp = Math.floor(100000 + Math.random() * 900000).toString();
              currentUsers.push({
                id: `USR-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                role: 'student' as const,
                fullName: s.name,
                email: existingEmail,
                phone: '',
                otp,
                password: otp,
                organization: this.schoolForm.name,
                track: s.track || (this.schoolForm.teams.length > 0 ? this.schoolForm.teams[0].track : 'coding'),
                ticket,
                status: 'Active' as const,
                registeredAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                lastLogin: 'Never'
              });
            }
          });
          this.contentService.saveUsers(currentUsers);
        }

        // Log student registrations
        if (this.activeTab === 'school' && this.schoolForm.students?.length) {
          const currentAudit2 = [...this.contentService.auditLogs];
          currentAudit2.unshift({
            action: `${this.schoolForm.students.length} students registered under ${this.schoolForm.name}`,
            user: this.schoolForm.repEmail || this.schoolForm.email,
            time: 'Just now',
            type: 'auth'
          });
          this.contentService.saveAuditLogs(currentAudit2);
        }
      } else if (this.activeTab === 'team') {
        approvalType = 'Team Addition';
        entity = this.teamForm.name;
        contact = this.teamForm.leadEmail;
        const rosterList = [this.teamForm.leadName, this.teamForm.member2Name, this.teamForm.member3Name, this.teamForm.member4Name, this.teamForm.member5Name].filter(Boolean).map((n: string) => n.trim()).filter((n: string) => n.length > 0);
        details = {
          school: this.teamForm.school,
          track: this.teamForm.track,
          project: this.teamForm.name + ' Sandbox Project',
          members: rosterList,
          coach: 'Instructor assigned by ' + this.teamForm.school
        };

        const currentTeams = [...this.contentService.teams];
        currentTeams.push({
          name: this.teamForm.name,
          track: this.teamForm.track || 'Coding',
          lead: this.teamForm.leadName || 'Student Captain',
          members: Math.max(rosterList.length, 3),
          rosterList: rosterList,
          status: 'In Competition',
          schoolName: this.teamForm.school || 'Registered Institution'
        });
        this.contentService.saveTeams(currentTeams);
      } else if (this.activeTab === 'instructor') {
        approvalType = 'Instructor Access';
        entity = this.instructorForm.name;
        contact = this.instructorForm.email;
        const selectedExpertise = Object.keys(this.instructorForm.expertise)
          .filter(k => this.instructorForm.expertise[k])
          .join(', ');
        details = {
          institution: this.instructorForm.institution || 'Independent Mentor',
          credentials: this.instructorForm.qualification || 'MSc Computer Science',
          specialization: selectedExpertise || 'Coding, AI',
          phone: this.instructorForm.tel || '',
          experience: 'Mentor with registered history',
          courses: ['LMS Course 101: Python Intro', 'LMS Course 202: Robotics Base'],
          docs: this.selectedFileIds['instructorDocs']?.length
            ? this.selectedFileIds['instructorDocs'].map((id, i) => `${id}::${this.selectedFileNames['instructorDocs']?.[i] || 'document.pdf'}`)
            : undefined
        };
      } else if (this.activeTab === 'judge') {
        const ticket = 'NTIC-JDG-' + Math.random().toString(36).substring(2, 6).toUpperCase();
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const newJudge = {
          id: 'USR-' + Date.now(),
          role: 'judge' as const,
          fullName: this.judgeForm.name,
          email: this.judgeForm.email,
          phone: this.judgeForm.tel,
          otp,
          password: otp,
          organization: this.judgeForm.organization,
          track: this.judgeForm.expertise || 'Coding & Algorithms',
          ticket,
          status: 'Active',
          registeredAt: new Date().toLocaleDateString('en-GB'),
          lastLogin: 'Never'
        };
        const currentUsers = [...this.contentService.users];
        currentUsers.unshift(newJudge);
        this.contentService.saveUsers(currentUsers);
        
        const currentAudit = [...this.contentService.auditLogs];
        currentAudit.unshift({
          action: `Judge token ${ticket} generated for ${newJudge.fullName}`,
          user: 'self-register@ntic.gov.gh',
          time: 'Just now',
          type: 'ticket'
        });
        this.contentService.saveAuditLogs(currentAudit);
        
        this.openCredentialsModal(
          'Judge Application Submitted! 🎉',
          'Your judge profile has been created. Copy and save your secure login credentials below:',
          ticket,
          otp,
          'Use these credentials to access the Judge & Grading Portal.',
          '/dashboard'
        );
      } else if (this.activeTab === 'sponsor') {
        const ticket = 'NTIC-SPO-' + Math.random().toString(36).substring(2, 6).toUpperCase();
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const newSponsor = {
          id: 'USR-' + Date.now(),
          role: 'sponsor' as const,
          fullName: this.sponsorForm.name,
          email: this.sponsorForm.email,
          phone: this.sponsorForm.repContact,
          otp,
          password: otp,
          organization: this.sponsorForm.name,
          tier: this.sponsorForm.tier.split(' ')[0],
          ticket,
          status: 'Active',
          registeredAt: new Date().toLocaleDateString('en-GB'),
          lastLogin: 'Never'
        };
        const currentUsers = [...this.contentService.users];
        currentUsers.unshift(newSponsor);
        this.contentService.saveUsers(currentUsers);

        const currentAudit = [...this.contentService.auditLogs];
        currentAudit.unshift({
          action: `Sponsor token ${ticket} generated for ${newSponsor.fullName}`,
          user: 'self-register@ntic.gov.gh',
          time: 'Just now',
          type: 'ticket'
        });
        this.contentService.saveAuditLogs(currentAudit);
        
        this.openCredentialsModal(
          'Sponsor Profile Registered! 🎉',
          'Your sponsor account has been created. Copy and save your secure credentials below:',
          ticket,
          otp,
          'Use these credentials to access the Sponsor Portal.',
          '/dashboard'
        );
      }

      if (approvalType) {
        const newApproval = {
          id: 'REQ-' + Date.now(),
          type: approvalType,
          entity,
          contact,
          submitted: 'Just now',
          details
        };
        const currentApprovals = [...this.contentService.pendingApprovals];
        currentApprovals.unshift(newApproval);
        this.contentService.saveApprovals(currentApprovals);

        const emailTo = contact || '';
        const emailName = entity || '';
        let phone = '';
        if (this.activeTab === 'school') phone = this.schoolForm.repTel || this.schoolForm.tel || '';
        else if (this.activeTab === 'team') phone = '';
        else if (this.activeTab === 'instructor') phone = this.instructorForm.tel || '';
        if (emailTo) {
          this.emailService.sendPendingConfirmation(emailTo, emailName, emailName, approvalType, phone);
        }

        const currentAudit = [...this.contentService.auditLogs];
        currentAudit.unshift({
          action: `New ${approvalType} requested: ${entity}`,
          user: contact,
          time: 'Just now',
          type: 'approval'
        });
        this.contentService.saveAuditLogs(currentAudit);
      }

      // Remove this draft from saved drafts
      if (contact) {
        const drafts = JSON.parse(localStorage.getItem('ntic_drafts') || '{}');
        delete drafts[contact.trim().toLowerCase()];
        localStorage.setItem('ntic_drafts', JSON.stringify(drafts));
      }

      this.isSuccessModalOpen = true;
      this.clearDraftPrefills();
    } catch (err) {
      console.error('[Registration] Submission error:', err);
      this.isSubmitting = false;
      this.isPreviewModalOpen = false;
      alert('Submission failed. Please try again. Error: ' + (err as any)?.message);
    }
    }, 1500);
  }

  closeSuccessModal(): void {
    this.isSuccessModalOpen = false;
    this.regState = 'gateway';
    this.judgeForm = {
      name: '',
      tel: '',
      email: '',
      organization: '',
      expertise: '',
      experience: '',
      bio: '',
      ticketCode: '',
      otp: '',
      acceptedTerms: false
    };
  }
}
