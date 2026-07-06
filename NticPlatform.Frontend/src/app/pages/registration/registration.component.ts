import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ThemeService } from '../../services/theme.service';
import { ContentService } from '../../services/content.service';

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
  studentRegMode = 'single';
  selectedTrack = 'robotics';
  showAdminPaths = false;

  verificationMethod = 'email'; // 'email' | 'mobile'
  verificationInput = '';
  otpCode = '';
  otpError = '';
  resendTimer = 0;
  resendInterval: any;
  showTestCodeTip = false;

  // Prefilled mock draft data to populate on successful resume
  mockDraftData = {
    schoolName: 'Prempeh College (Draft Resume)',
    category: 'Public High School',
    region: 'Ashanti',
    district: 'Kumasi Metropolitan',
    tel: '+233 24 412 3456',
    email: 'prempeh.draft@edu.gh',
    gps: '6.6666° N, 1.6163° W',
    repName: 'Kwame Osei',
    repEmail: 'k.osei@edu.gh',
    repTel: '+233 50 123 4567',
    students: [
      { name: 'Kojo Antwi', dob: '2010-05-12', gender: 'Male', class: 'Form 2', guardian: 'Mr. Antwi +233...', track: 'coding', skills: { alg: 'advanced', hw: 'intermediate', ai: 'novice' } }
    ],
    teams: [
      { name: 'Prempeh Robo Alpha', track: 'Robotics', leadName: 'Kwame Osei', leadEmail: 'k.osei@edu.gh', member2Name: 'Kofi Manu', member2Email: 'k.manu@edu.gh', member3Name: 'Yaw Boakye', member3Email: 'y.boakye@edu.gh' }
    ]
  };

  rightPanelMode = 'preview'; // 'preview' | 'list'

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
    teams: [] as any[]
  };

  studentForm = {
    name: '',
    id: '',
    dob: '',
    gender: 'Male',
    school: 'Achimota SHS',
    class: 'Form 1',
    guardian: '',
    skills: {
      alg: 'intermediate',
      hw: 'advanced',
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
    otp: ''
  };

  sponsorForm = {
    name: '',
    sector: 'Energy & Mining',
    repName: '',
    repContact: '',
    email: '',
    amount: '',
    tier: 'Platinum Partner (₵ 100k+)',
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

  constructor(private route: ActivatedRoute, private router: Router, public themeService: ThemeService, public contentService: ContentService) {}

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
    
    if (this.verificationMethod === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(this.verificationInput)) {
        this.otpError = 'Please enter a valid email address.';
        return;
      }
    } else {
      const phoneRegex = /^\+?[0-9]{8,15}$/;
      if (!phoneRegex.test(this.verificationInput.replace(/\s+/g, ''))) {
        this.otpError = 'Please enter a valid mobile number.';
        return;
      }
    }

    this.otpError = '';
    this.otpCode = '';
    this.regState = 'otp_verification';
    this.startResendTimer();
    this.showTestCodeTip = true;
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
    this.otpCode = '';
    this.otpError = '';
    this.startResendTimer();
  }

  verifyOTP(): void {
    if (this.otpCode.length !== 6) {
      this.otpError = 'Please enter the complete 6-digit code.';
      return;
    }

    if (this.otpCode === '123456') {
      this.otpError = '';
      this.regState = 'resume_success';
      this.clearTimer();
      
      // Auto-transition to form with prefilled draft data after 2 seconds
      setTimeout(() => {
        this.applyDraftPrefills();
        this.regState = 'new';
      }, 2200);
    } else {
      this.otpError = 'Invalid code. Use 123456 to test the flow successfully.';
    }
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
      alert('Please enter student name.');
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
      alert('Please enter team name.');
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

  detectGps(): void {
    this.schoolForm.gps = '5.6037° N, 0.1870° W';
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
    this.activeTab = role;
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
        otp: ''
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
    this.schoolStep = 1;
    this.maxSchoolStepReached = 1;
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
      teams: []
    };
  }

  private applyDraftPrefills(): void {
    this.schoolStep = 1;
    this.maxSchoolStepReached = 4;
    this.schoolForm.name = this.mockDraftData.schoolName;
    this.schoolForm.category = this.mockDraftData.category;
    this.schoolForm.region = this.mockDraftData.region;
    this.schoolForm.district = this.mockDraftData.district;
    this.schoolForm.tel = this.mockDraftData.tel;
    this.schoolForm.email = this.mockDraftData.email;
    this.schoolForm.gps = this.mockDraftData.gps;
    this.schoolForm.repName = this.mockDraftData.repName;
    this.schoolForm.repEmail = this.mockDraftData.repEmail;
    this.schoolForm.repTel = this.mockDraftData.repTel;
    this.schoolForm.students = [...this.mockDraftData.students];
    this.schoolForm.teams = [...this.mockDraftData.teams];
    this.activeTab = 'school';
  }

  openPreviewModal(): void {
    if (!this.schoolForm.name) {
      alert('Please fill out the form (at least the School Name) before previewing.');
      return;
    }
    this.isPreviewModalOpen = true;
  }

  closePreviewModal(): void {
    this.isPreviewModalOpen = false;
  }

  submitRegistration(): void {
    if (this.isSubmitting) return;
    this.isSubmitting = true;
    
    // Simulate API call with modern loader
    setTimeout(() => {
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
          phone: this.schoolForm.repTel || this.schoolForm.tel,
          code: this.schoolForm.name.slice(0, 3).toUpperCase() + '-REG-2026',
          tracks: this.schoolForm.teams.map((t: any) => t.track).filter((value: any, index: number, self: any[]) => self.indexOf(value) === index).join(', ') || 'Coding, Robotics',
          teamsList: this.schoolForm.teams,
          docs: ['Accreditation_' + this.schoolForm.name.replace(/ /g, '_') + '.pdf'],
          infra: 'IT Lab facility registered, ' + this.schoolForm.students.length + ' students enrolled'
        };

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
          experience: 'Mentor with registered history',
          courses: ['LMS Course 101: Python Intro', 'LMS Course 202: Robotics Base']
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
        
        alert(`Judge application submitted! Your access pass code is: ${ticket}. OTP: ${otp}. You can now log in using these credentials.`);
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
        
        alert(`Sponsor registration submitted! Your access pass code is: ${ticket}. OTP: ${otp}. You can now log in using these credentials.`);
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

        const currentAudit = [...this.contentService.auditLogs];
        currentAudit.unshift({
          action: `New ${approvalType} requested: ${entity}`,
          user: contact,
          time: 'Just now',
          type: 'approval'
        });
        this.contentService.saveAuditLogs(currentAudit);
      }

      this.isSuccessModalOpen = true;
      this.clearDraftPrefills();
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
      otp: ''
    };
  }
}
