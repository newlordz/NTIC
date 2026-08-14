import { getAuthValue, setAuthValue, clearAuthValue, getRememberedCredentials, saveRememberedCredentials, hasRememberedDevice, forgetRememberedCredentials } from '../../services/session.util';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ThemeService } from '../../services/theme.service';
import { ContentService } from '../../services/content.service';
import { FileStorageService } from '../../services/file-storage.service';
import { BrevoEmailService } from '../../services/brevo-email.service';
import { SmsService } from '../../services/sms.service';
import { NotificationService } from '../../services/notification.service';
import { DialogService } from '../../services/dialog.service';
import { ApiService } from '../../services/api.service';

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
  selectedTrack = '';
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
  editingApprovalId: string | null = null;
  justUpdatedApplication = false;
  lastApplicationCode: string | null = null;
  copiedApplicationCode = false;

  credentialsModal: {
    isOpen: boolean;
    title: string;
    subtitle: string;
    accessPass: string;
    pin: string;
    extraInfo?: string;
    nextRoute?: string;
    autoLoginEmail?: string;
    autoLoginRole?: string;
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

  openCredentialsModal(title: string, subtitle: string, accessPass: string, pin: string, extraInfo?: string, nextRoute?: string, autoLoginEmail?: string, autoLoginRole?: string) {
    this.credentialsModal = {
      isOpen: true,
      title,
      subtitle,
      accessPass,
      pin,
      extraInfo,
      nextRoute,
      autoLoginEmail,
      autoLoginRole,
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
    const email = this.credentialsModal?.autoLoginEmail;
    const role = this.credentialsModal?.autoLoginRole;
    this.credentialsModal = null;

    if (email && role) {
setAuthValue('activeUserEmail', email, this.rememberDevice);
  setAuthValue('activeRoleId', role, this.rememberDevice);
    }

    if (route) {
      this.router.navigate([route]);
    } else if (role === 'judge') {
      this.router.navigate(['/judge']);
    } else if (role === 'sponsor') {
      this.router.navigate(['/sponsors']);
    } else {
      this.router.navigate(['/dashboard']);
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
  gpsAccuracyWarning = '';
  gpsLookupLoading = false;

  isGpsSearchModalOpen = false;
  gpsSearchQuery = '';
  gpsSearchResults: Array<{ name: string; address: string; lat: string; lng: string }> = [];
  gpsSearching = false;
  gpsSearchError = '';

  private ghanaSchoolsGpsDb: Array<{ name: string; address: string; lat: string; lng: string }> = [
    { name: 'Achimota School', address: 'Achimota, Accra, Greater Accra Region', lat: '5.623450', lng: '-0.218900' },
    { name: 'Prempeh College', address: 'Sofoline, Kumasi, Ashanti Region', lat: '6.697200', lng: '-1.646800' },
    { name: 'Presbyterian Boys\' Secondary School (PRESEC Legon)', address: 'Legon, Accra, Greater Accra Region', lat: '5.659600', lng: '-0.177200' },
    { name: 'Mfantsipim School', address: 'Cape Coast, Central Region', lat: '5.114700', lng: '-1.252300' },
    { name: 'Adisadel College', address: 'Cape Coast, Central Region', lat: '5.123900', lng: '-1.272100' },
    { name: 'Holy Child School', address: 'Cape Coast, Central Region', lat: '5.118900', lng: '-1.261200' },
    { name: 'Wesley Girls\' High School', address: 'Cape Coast, Central Region', lat: '5.132800', lng: '-1.276400' },
    { name: 'St. Augustine\'s College', address: 'Cape Coast, Central Region', lat: '5.105400', lng: '-1.289100' },
    { name: 'Opoku Ware School', address: 'Santasi, Kumasi, Ashanti Region', lat: '6.671900', lng: '-1.637500' },
    { name: 'St. Peter\'s Senior High School', address: 'Nkwatia Kwahu, Eastern Region', lat: '6.621400', lng: '-0.738900' },
    { name: 'Aburi Girls\' Senior High School', address: 'Aburi, Eastern Region', lat: '5.854100', lng: '-0.174600' },
    { name: 'Tamale Senior High School (TAMASCO)', address: 'Tamale, Northern Region', lat: '9.407500', lng: '-0.839300' },
    { name: 'Ghana National College', address: 'Cape Coast, Central Region', lat: '5.139200', lng: '-1.258900' },
    { name: 'Accra Academy', address: 'Bubuashie, Accra, Greater Accra Region', lat: '5.572100', lng: '-0.244800' },
    { name: 'Koforidua Senior High Technical School (SECTECH)', address: 'Koforidua, Eastern Region', lat: '6.094500', lng: '-0.261200' },
    { name: 'Mawuli School', address: 'Ho, Volta Region', lat: '6.611200', lng: '0.472300' },
    { name: 'Kumasi Academy', address: 'Asokore Mampong, Kumasi, Ashanti Region', lat: '6.702300', lng: '-1.584100' },
    { name: 'Yaa Asantewaa Girls\' Senior High School', address: 'Tanoso, Kumasi, Ashanti Region', lat: '6.709200', lng: '-1.691400' },
    { name: 'Bishop Herman College', address: 'Kpando, Volta Region', lat: '6.993400', lng: '0.291200' },
    { name: 'St. Thomas Aquinas Senior High School', address: 'Cantonments, Accra, Greater Accra Region', lat: '5.578900', lng: '-0.171400' },
    { name: 'University of Ghana', address: 'Legon Boundary, Accra, Greater Accra Region', lat: '5.650800', lng: '-0.187000' },
    { name: 'Kwame Nkrumah University of Science and Technology (KNUST)', address: 'Kumasi, Ashanti Region', lat: '6.674500', lng: '-1.571600' },
    { name: 'University of Cape Coast (UCC)', address: 'Cape Coast, Central Region', lat: '5.115500', lng: '-1.282500' }
  ];

  openSchoolGpsModal(): void {
    this.isGpsSearchModalOpen = true;
    this.gpsSearchQuery = this.schoolForm.name?.trim() || '';
    this.gpsSearchError = '';
    this.searchSchoolGps();
  }

  closeSchoolGpsModal(): void {
    this.isGpsSearchModalOpen = false;
  }

  async searchSchoolGps(): Promise<void> {
    const q = (this.gpsSearchQuery || '').trim().toLowerCase();
    this.gpsSearching = true;
    this.gpsSearchError = '';
    this.gpsSearchResults = [];

    // 1. First check local preset Ghanaian schools database
    const localMatches = this.ghanaSchoolsGpsDb.filter(s =>
      !q || s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q)
    );
    this.gpsSearchResults = [...localMatches];

    // 2. Also perform live OpenStreetMap search if query provided
    if (q) {
      try {
        const queryEncoded = encodeURIComponent(`${this.gpsSearchQuery}, Ghana`);
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${queryEncoded}&countrycodes=gh&limit=8`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            for (const item of data) {
              const lat = parseFloat(item.lat).toFixed(6);
              const lng = parseFloat(item.lon).toFixed(6);
              const name = item.name || (item.display_name ? item.display_name.split(',')[0] : 'Location in Ghana');
              const address = item.display_name || '';
              if (!this.gpsSearchResults.some(r => Math.abs(parseFloat(r.lat) - parseFloat(lat)) < 0.0001 && Math.abs(parseFloat(r.lng) - parseFloat(lng)) < 0.0001)) {
                this.gpsSearchResults.push({ name, address, lat, lng });
              }
            }
          }
        }
      } catch {
        // Continue with local DB matches if network search fails
      }
    }

    if (this.gpsSearchResults.length === 0) {
      this.gpsSearchError = 'No matching schools or landmarks found in Ghana. Try searching by town or entering coordinates manually.';
    }

    this.gpsSearching = false;
  }

  selectSchoolGps(result: { name: string; address: string; lat: string; lng: string }): void {
    this.schoolForm.gps = `${result.lat}, ${result.lng}`;
    this.gpsAddress = result.address || result.name;
    this.gpsAccuracyWarning = '';
    this.isGpsSearchModalOpen = false;
    this.notificationService.success(`Applied GPS coordinates for ${result.name}`, 'GPS Coordinates Set');
    this.tryAutoSave();
  }

  studentForm = {
    name: '',
    id: '',
    email: '',
    dob: '',
    gender: '',
    school: '',
    class: '',
    region: 'Greater Accra',
    guardianName: '',
    guardianPhone: '',
    track: 'coding',
    skills: {
      alg: 'intermediate',
      hw: 'novice',
      ai: 'novice'
    }
  };

  teamForm = {
    name: '',
    school: '',
    region: 'Greater Accra',
    track: '',
    leadName: '',
    leadEmail: '',
    member2Name: '',
    member2Email: '',
    member3Name: '',
    member3Email: '',
    member4Name: '',
    member4Email: '',
    member5Name: '',
    member5Email: '',
    skills: { alg: 'intermediate', hw: 'novice', ai: 'novice' }
  };

  instructorForm = {
    name: '',
    tel: '',
    email: '',
    address: '',
    region: 'Greater Accra',
    qualification: 'BSc',
    institution: '',
    isIndependent: false,
    acceptedTerms: false,
    portfolio: '',
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
    region: 'Greater Accra',
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
    region: 'Greater Accra',
    package: '',
    acceptedTerms: false,
    arenas: {
      'Coding Track': true,
      'Robotics Arena': true,
      'AI & ML Challenge': true,
      'Cyber Security CTF': true,
      'Open Innovation': true
    } as { [key: string]: boolean }
  };

  openRegForm = {
    fullName: '',
    email: '',
    phone: '',
    ageGroup: 'junior',
    experienceLevel: 'beginner',
    organization: '',
    selectedCompetitionId: '',
    acceptedTerms: false,
    emailVerified: false,
    phoneVerified: false
  };

  openRegPhotoUrl: string | null = null;
  openRegDocName: string | null = null;
  openRegPhotoFileId: string | null = null;
  openRegDocFileId: string | null = null;

  availableOpenCompetitions: any[] = [];

  ageGroups = [
    { value: 'junior', label: 'Junior (13-17)', icon: 'person_raised_hand' },
    { value: 'senior', label: 'Senior (18+)', icon: 'person' },
    { value: 'open', label: 'Open Category', icon: 'groups' }
  ];

  experienceLevels = [
    { value: 'beginner', label: 'Beginner', icon: 'school' },
    { value: 'intermediate', label: 'Intermediate', icon: 'trending_up' },
    { value: 'advanced', label: 'Advanced', icon: 'rocket_launch' }
  ];

  // ── LIVE VALIDATION STATE ────────────────────────────────────────
  fieldValidation: Record<string, { status: 'idle' | 'checking' | 'valid' | 'taken' | 'invalid' | 'draft_found'; message: string }> = {};
  private validationTimers: Record<string, any> = {};

  clearValidationState(): void {
    this.fieldValidation = {};
    this.fieldVerified = {};
    for (const key in this.validationTimers) {
      if (this.validationTimers[key]) clearTimeout(this.validationTimers[key]);
    }
    this.validationTimers = {};
  }

  readonly DRAFT_TTL_DAYS = 7; // Drafts automatically expire after 7 days of inactivity

  purgeExpiredDrafts(): void {
    try {
      const drafts = JSON.parse(localStorage.getItem('ntic_drafts') || '{}');
      const now = Date.now();
      let modified = false;

      for (const key in drafts) {
        const d = drafts[key];
        const savedTime = d?.savedAt ? new Date(d.savedAt).getTime() : now;
        const expiresAt = d?.expiresAt || (savedTime + this.DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000);
        if (now > expiresAt) {
          delete drafts[key];
          modified = true;
        }
      }

      if (modified) {
        localStorage.setItem('ntic_drafts', JSON.stringify(drafts));
      }
    } catch {}
  }

  getDraftTimeRemaining(contact: string): string {
    try {
      this.purgeExpiredDrafts();
      const drafts = JSON.parse(localStorage.getItem('ntic_drafts') || '{}');
      const key = contact?.trim().toLowerCase();
      const draft = drafts[key] || drafts[contact];
      if (!draft) return '';

      const now = Date.now();
      const savedTime = draft.savedAt ? new Date(draft.savedAt).getTime() : now;
      const expiresAt = draft.expiresAt || (savedTime + this.DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000);
      const remainingMs = expiresAt - now;

      if (remainingMs <= 0) return 'expired';

      const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
      if (remainingHours > 24) {
        const days = Math.ceil(remainingHours / 24);
        return `${days} ${days === 1 ? 'day' : 'days'} left`;
      }
      return `${remainingHours} ${remainingHours === 1 ? 'hour' : 'hours'} left`;
    } catch {
      return '';
    }
  }

  hasSavedDraft(contact: string): boolean {
    if (!contact || !contact.trim()) return false;
    this.purgeExpiredDrafts();
    const drafts = JSON.parse(localStorage.getItem('ntic_drafts') || '{}');
    const key = contact.trim().toLowerCase();
    return !!(drafts[key] || drafts[contact]);
  }

  resumeDraftFromField(contact: string): void {
    if (!contact || !contact.trim()) return;
    this.verificationMethod = contact.includes('@') ? 'email' : 'mobile';
    this.verificationInput = contact.trim();
    this.sendOTP();
  }

  validateEmailLive(fieldName: string, value: string): void {
    if (this.validationTimers[fieldName]) clearTimeout(this.validationTimers[fieldName]);
    if (!value || !value.trim()) {
      this.fieldValidation[fieldName] = { status: 'idle', message: '' };
      delete this.fieldVerified[fieldName];
      return;
    }
    this.fieldValidation[fieldName] = { status: 'checking', message: 'Checking...' };
    this.validationTimers[fieldName] = setTimeout(() => {
      if (!value || !value.trim()) {
        this.fieldValidation[fieldName] = { status: 'idle', message: '' };
        delete this.fieldVerified[fieldName];
        this.revalidateSiblingFields(fieldName, 'email');
        return;
      }
      if (!this.contentService.isValidEmail(value)) {
        this.fieldValidation[fieldName] = { status: 'invalid', message: 'Invalid email format' };
      } else if (this.isDuplicateInForm(fieldName, value)) {
        const msg = this.activeTab === 'school'
          ? 'School email and representative email cannot be the same'
          : 'Duplicate email used by another squad member';
        this.fieldValidation[fieldName] = { status: 'taken', message: msg };
      } else if (this.contentService.isEmailTaken(value, this.editingApprovalId || undefined)) {
        this.fieldValidation[fieldName] = { status: 'taken', message: 'This email is already registered' };
      } else if (this.hasSavedDraft(value) && !this.isDraftResumed) {
        const timeRemaining = this.getDraftTimeRemaining(value);
        const timeText = timeRemaining ? ` (${timeRemaining})` : '';
        this.fieldValidation[fieldName] = { status: 'draft_found', message: `This email is reserved by a saved draft${timeText}. Resume the draft or wait for expiry.` };
      } else {
        this.fieldValidation[fieldName] = { status: 'valid', message: 'Email available' };
      }
      this.revalidateSiblingFields(fieldName, 'email');
    }, 400);
  }

  private isDuplicateInForm(fieldName: string, value: string): boolean {
    const v = value.trim().toLowerCase();
    if (!v) return false;
    if (this.activeTab === 'school') {
      if (fieldName === 'schoolEmail') return (this.schoolForm.repEmail || '').trim().toLowerCase() === v;
      if (fieldName === 'schoolRepEmail') return (this.schoolForm.email || '').trim().toLowerCase() === v;
    }
    if (this.activeTab === 'team' || (this.activeTab === 'student' && this.competitorMode === 'group')) {
      const emails: { name: string; value: string }[] = [
        { name: 'squadLeadEmail', value: this.teamForm.leadEmail },
        { name: 'squadM2Email', value: this.teamForm.member2Email },
        { name: 'squadM3Email', value: this.teamForm.member3Email },
        { name: 'squadM4Email', value: this.teamForm.member4Email },
        { name: 'squadM5Email', value: this.teamForm.member5Email },
      ];
      return emails.some(e => e.name !== fieldName && e.value?.trim().toLowerCase() === v);
    }
    return false;
  }

  private normalizePhone(phone: string): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('233') && digits.length >= 12) {
      return digits.substring(3);
    }
    if (digits.startsWith('0') && digits.length >= 10) {
      return digits.substring(1);
    }
    return digits;
  }

  private isDuplicatePhoneInForm(fieldName: string, value: string): boolean {
    const v = this.normalizePhone(value);
    if (!v) return false;
    if (this.activeTab === 'school') {
      if (fieldName === 'schoolTel') return this.normalizePhone(this.schoolForm.repTel) === v;
      if (fieldName === 'schoolRepTel') return this.normalizePhone(this.schoolForm.tel) === v;
    }
    return false;
  }

  private revalidateSiblingFields(currentFieldName: string, type: 'email' | 'phone'): void {
    if (this.activeTab === 'school') {
      if (type === 'email') {
        const sibling = currentFieldName === 'schoolEmail' ? 'schoolRepEmail' : currentFieldName === 'schoolRepEmail' ? 'schoolEmail' : null;
        if (sibling && this.fieldValidation[sibling] && this.fieldValidation[sibling].status !== 'idle') {
          const val = sibling === 'schoolEmail' ? this.schoolForm.email : this.schoolForm.repEmail;
          if (val && val.trim()) {
            if (!this.contentService.isValidEmail(val)) {
              this.fieldValidation[sibling] = { status: 'invalid', message: 'Invalid email format' };
            } else if (this.isDuplicateInForm(sibling, val)) {
              this.fieldValidation[sibling] = { status: 'taken', message: 'School email and representative email cannot be the same' };
            } else if (!this.contentService.isEmailTaken(val, this.editingApprovalId || undefined)) {
              this.fieldValidation[sibling] = { status: 'valid', message: 'Email available' };
            }
          }
        }
      } else if (type === 'phone') {
        const sibling = currentFieldName === 'schoolTel' ? 'schoolRepTel' : currentFieldName === 'schoolRepTel' ? 'schoolTel' : null;
        if (sibling && this.fieldValidation[sibling] && this.fieldValidation[sibling].status !== 'idle') {
          const val = sibling === 'schoolTel' ? this.schoolForm.tel : this.schoolForm.repTel;
          if (val && val.trim()) {
            if (!this.contentService.isValidGhanaPhone(val)) {
              this.fieldValidation[sibling] = { status: 'invalid', message: 'Enter a valid Ghana number (0XX XXX XXXX or +233...)' };
            } else if (this.isDuplicatePhoneInForm(sibling, val)) {
              this.fieldValidation[sibling] = { status: 'taken', message: 'School telephone and representative telephone cannot be the same' };
            } else if (!this.contentService.isPhoneTaken(val, this.editingApprovalId || undefined)) {
              this.fieldValidation[sibling] = { status: 'valid', message: 'Number available' };
            }
          }
        }
      }
    } else if (type === 'email') {
      this.revalidateOtherSquadEmails(currentFieldName);
    }
  }

  private revalidateOtherSquadEmails(currentFieldName: string): void {
    if (this.activeTab === 'team' || (this.activeTab === 'student' && this.competitorMode === 'group')) {
      const fields = ['squadLeadEmail', 'squadM2Email', 'squadM3Email', 'squadM4Email', 'squadM5Email'];
      fields.filter(f => f !== currentFieldName).forEach(f => {
        const val = this.getSquadEmailValue(f);
        if (val && this.fieldValidation[f] && (this.fieldValidation[f].status === 'valid' || this.fieldValidation[f].status === 'taken')) {
          if (this.isDuplicateInForm(f, val)) {
            this.fieldValidation[f] = { status: 'taken', message: 'Duplicate email used by another squad member' };
          } else if (!this.contentService.isEmailTaken(val, this.editingApprovalId || undefined)) {
            this.fieldValidation[f] = { status: 'valid', message: 'Email available' };
          }
        }
      });
    }
  }

  private getSquadEmailValue(fieldName: string): string {
    if (fieldName === 'squadLeadEmail') return this.teamForm.leadEmail || '';
    if (fieldName === 'squadM2Email') return this.teamForm.member2Email || '';
    if (fieldName === 'squadM3Email') return this.teamForm.member3Email || '';
    if (fieldName === 'squadM4Email') return this.teamForm.member4Email || '';
    if (fieldName === 'squadM5Email') return this.teamForm.member5Email || '';
    return '';
  }

  validatePhoneLive(fieldName: string, value: string): void {
    if (this.validationTimers[fieldName]) clearTimeout(this.validationTimers[fieldName]);
    if (!value || !value.trim()) {
      this.fieldValidation[fieldName] = { status: 'idle', message: '' };
      delete this.fieldVerified[fieldName];
      this.revalidateSiblingFields(fieldName, 'phone');
      return;
    }
    this.fieldValidation[fieldName] = { status: 'checking', message: 'Checking...' };
    this.validationTimers[fieldName] = setTimeout(() => {
      if (!value || !value.trim()) {
        this.fieldValidation[fieldName] = { status: 'idle', message: '' };
        delete this.fieldVerified[fieldName];
        this.revalidateSiblingFields(fieldName, 'phone');
        return;
      }
      if (!this.contentService.isValidGhanaPhone(value)) {
        this.fieldValidation[fieldName] = { status: 'invalid', message: 'Enter a valid Ghana number (0XX XXX XXXX or +233...)' };
      } else if (this.isDuplicatePhoneInForm(fieldName, value)) {
        this.fieldValidation[fieldName] = { status: 'taken', message: 'School telephone and representative telephone cannot be the same' };
      } else if (this.contentService.isPhoneTaken(value, this.editingApprovalId || undefined)) {
        this.fieldValidation[fieldName] = { status: 'taken', message: 'This number is already registered' };
      } else if (this.hasSavedDraft(value) && !this.isDraftResumed) {
        const timeRemaining = this.getDraftTimeRemaining(value);
        const timeText = timeRemaining ? ` (${timeRemaining})` : '';
        this.fieldValidation[fieldName] = { status: 'draft_found', message: `This number is reserved by a saved draft${timeText}. Resume the draft or wait for expiry.` };
      } else {
        this.fieldValidation[fieldName] = { status: 'valid', message: 'Number available' };
      }
      this.revalidateSiblingFields(fieldName, 'phone');
    }, 400);
  }

  hasValidationErrors(): boolean {
    return Object.values(this.fieldValidation).some(v => v.status === 'taken' || v.status === 'invalid' || v.status === 'draft_found');
  }

  private validateCurrentTab(): boolean {
    const fields: Record<string, { value: string; type: 'email' | 'phone' }> = {};
    this.missingDocsError = '';
    if (this.activeTab === 'school') {
      fields['schoolEmail'] = { value: this.schoolForm.email, type: 'email' };
      fields['schoolRepEmail'] = { value: this.schoolForm.repEmail, type: 'email' };
      fields['schoolTel'] = { value: this.schoolForm.tel, type: 'phone' };
      fields['schoolRepTel'] = { value: this.schoolForm.repTel, type: 'phone' };
      // Prevent same email for school and representative
      if (this.schoolForm.email?.trim() && this.schoolForm.repEmail?.trim() &&
          this.schoolForm.email.trim().toLowerCase() === this.schoolForm.repEmail.trim().toLowerCase()) {
        this.showCustomAlert('The school email and representative email cannot be the same. Please use distinct email addresses.', 'Duplicate Email', 'warning');
        return false;
      }
    } else if (this.activeTab === 'instructor') {
      fields['instEmail'] = { value: this.instructorForm.email, type: 'email' };
      fields['instTel'] = { value: this.instructorForm.tel, type: 'phone' };
    } else if (this.activeTab === 'judge') {
      fields['jdEmail'] = { value: this.judgeForm.email, type: 'email' };
      fields['jdTel'] = { value: this.judgeForm.tel, type: 'phone' };
    } else if (this.activeTab === 'sponsor') {
      fields['sponsEmail'] = { value: this.sponsorForm.email, type: 'email' };
      fields['sponsContact'] = { value: this.sponsorForm.repContact, type: 'phone' };
    } else if (this.activeTab === 'open') {
      fields['openEmail'] = { value: this.openRegForm.email, type: 'email' };
      fields['openPhone'] = { value: this.openRegForm.phone, type: 'phone' };
      if (!this.openRegForm.selectedCompetitionId) {
        this.showCustomAlert('Please select a competition cycle to join.', 'Missing Selection', 'warning');
        return false;
      }
    }

    let blocked = false;
    for (const [key, { value, type }] of Object.entries(fields)) {
      if (!value?.trim()) continue;
      if (type === 'email') {
        if (!this.contentService.isValidEmail(value)) {
          this.fieldValidation[key] = { status: 'invalid', message: 'Invalid email format' };
          blocked = true;
        } else if (this.contentService.isEmailTaken(value, this.editingApprovalId || undefined)) {
          this.fieldValidation[key] = { status: 'taken', message: 'This email is already registered' };
          blocked = true;
        } else if (this.hasSavedDraft(value) && !this.isDraftResumed) {
          const timeText = this.getDraftTimeRemaining(value);
          this.fieldValidation[key] = { status: 'draft_found', message: `This email is reserved by a saved draft${timeText ? ' (' + timeText + ')' : ''}. Resume the draft or wait for expiry.` };
          blocked = true;
        }
      } else {
        if (!this.contentService.isValidGhanaPhone(value)) {
          this.fieldValidation[key] = { status: 'invalid', message: 'Enter a valid Ghana number' };
          blocked = true;
        } else if (this.contentService.isPhoneTaken(value, this.editingApprovalId || undefined)) {
          this.fieldValidation[key] = { status: 'taken', message: 'This number is already registered' };
          blocked = true;
        } else if (this.hasSavedDraft(value) && !this.isDraftResumed) {
          const timeText = this.getDraftTimeRemaining(value);
          this.fieldValidation[key] = { status: 'draft_found', message: `This number is reserved by a saved draft${timeText ? ' (' + timeText + ')' : ''}. Resume the draft or wait for expiry.` };
          blocked = true;
        }
      }
    }

    if (this.activeTab === 'school' && !(this.selectedFileIds['accredDocs']?.length)) {
      this.missingDocsError = 'Please upload your Accreditation Documents before submitting.';
      blocked = true;
    } else if (this.activeTab === 'instructor' && !(this.selectedFileIds['instructorDocs']?.length)) {
      this.missingDocsError = 'Please upload your Documents (CV, Certificates, National ID) before submitting.';
      blocked = true;
    }

    if (blocked) {
      const msg = this.missingDocsError || 'Please fix the highlighted email/phone errors before submitting.';
      this.showCustomAlert(msg, 'Validation Error', 'warning');
    }
    return !blocked;
  }

  // ── FIELD VERIFICATION + OTP ───────────────────────────────────
  fieldVerified: Record<string, boolean> = {};
  verifyOtpModalOpen = false;
  verifyTargetField = '';
  verifyTargetType: 'email' | 'phone' = 'email';
  verifyTargetValue = '';
  verifyOtpInput = '';
  verifyOtpError = '';
  verifyOtpSent = false;
  private verifyStoredOtp = '';

  get currentTabVerified(): boolean {
    if (this.activeTab === 'school') {
      return !!(this.fieldVerified['schoolEmail'] && this.fieldVerified['schoolRepTel']);
    } else if (this.activeTab === 'instructor') {
      return !!(this.fieldVerified['instEmail'] && this.fieldVerified['instTel']);
    } else if (this.activeTab === 'judge') {
      return !!(this.fieldVerified['jdEmail'] && this.fieldVerified['jdTel']);
    } else if (this.activeTab === 'sponsor') {
      return !!(this.fieldVerified['sponsEmail'] && this.fieldVerified['sponsContact']);
    }
    return false;
  }

  canVerifyField(fieldName: string, value?: string): boolean {
    if (value !== undefined && (!value || !value.trim())) return false;
    const v = this.fieldValidation[fieldName];
    return v?.status === 'valid' && !this.fieldVerified[fieldName];
  }

  sendVerifyOtp(fieldName: string, type: 'email' | 'phone', value: string): void {
    this.verifyTargetField = fieldName;
    this.verifyTargetType = type;
    this.verifyTargetValue = value;
    this.verifyOtpInput = '';
    this.verifyOtpError = '';
    this.verifyOtpSent = false;

    this.verifyStoredOtp = Math.floor(100000 + Math.random() * 900000).toString();

    if (type === 'email') {
      try {
        this.emailService.sendOtpEmail(value, this.verifyStoredOtp);
      } catch { /* ignore */ }
    } else if (type === 'phone') {
      try {
        this.smsService.sendOtpSms(value, this.verifyStoredOtp).subscribe();
      } catch { /* ignore */ }
    }

    this.verifyOtpSent = true;
    this.verifyOtpModalOpen = true;

    // Trigger non-blocking toast alert instead of a modal popup overlay
    this.notificationService.info(
      `A 6-digit verification code was dispatched to ${value}`,
      'Verification Code Sent'
    );
  }

  confirmVerifyOtp(): void {
    if (this.verifyOtpInput.length !== 6) {
      this.verifyOtpError = 'Enter the complete 6-digit code.';
      return;
    }
    if (this.verifyOtpInput !== this.verifyStoredOtp) {
      this.verifyOtpError = 'Invalid code. Please try again.';
      return;
    }
    this.fieldVerified[this.verifyTargetField] = true;
    this.verifyOtpModalOpen = false;
    this.notificationService.success(
      `${this.verifyTargetType === 'email' ? 'Email' : 'Phone number'} verified successfully!`,
      'Verified'
    );
    this.tryAutoSave();
  }

  closeVerifyModal(): void {
    this.verifyOtpModalOpen = false;
    this.verifyOtpInput = '';
    this.verifyOtpError = '';
  }

  private tryAutoSave(): void {
    if (this.currentTabVerified) {
      this.saveDraft();
    }
  }

  tracks = [
    { id: 'coding', label: 'Coding', icon: 'code' },
    { id: 'robotics', label: 'Robotics', icon: 'smart_toy' },
    { id: 'ai', label: 'AI', icon: 'psychology' },
    { id: 'cyber', label: 'Networking & Cybersecurity', icon: 'security' },
    { id: 'innovation', label: 'Innovation', icon: 'tips_and_updates' },
  ];

  recentStudents: any[] = [];

  sponsors = [
    { name: 'Tullow Ghana', package: 'Full Championship', tier: 'Platinum', support: 'Coding & AI', items: 'Team ×3, Equipment ×5', amount: '₵ 120,000', total: '₵ 120,000', status: 'Confirmed' },
    { name: 'MTN Ghana Foundation', package: 'Track Sponsorship', tier: 'Platinum', support: 'Robotics & Cyber', items: 'Track ×2, Prizes ×3', amount: '₵ 80,000', total: '₵ 80,000', status: 'Confirmed' },
    { name: 'GCB Bank PLC', package: 'Student Sponsorship', tier: 'Gold', support: 'Innovation Arena', items: 'Student ×40', amount: '₵ 40,000', total: '₵ 40,000', status: 'Confirmed' },
  ];

  isAuthorizedUser = false;
  isPreviewModalOpen = false;
  isSuccessModalOpen = false;
  isSubmitting = false;

  selectedFileIds: { [key: string]: string[] } = {};
  selectedFileNames: { [key: string]: string[] } = {};
  schoolLogoUrl: string | null = null;
  judgeLogoUrl: string | null = null;
  sponsorLogoUrl: string | null = null;
  studentPhotoUrl: string | null = null;
  groupPhotoUrl: string | null = null;
  groupLogoUrl: string | null = null;
  memberPhotoUrls: Record<string, string | null> = { lead: null, m2: null, m3: null, m4: null, m5: null };
  missingDocsError = '';

  get hasRequiredDocs(): boolean {
    if (this.activeTab === 'school') {
      return !!(this.selectedFileIds['accredDocs']?.length);
    }
    if (this.activeTab === 'instructor') {
      return !!(this.selectedFileIds['instructorDocs']?.length);
    }
    return true;
  }

  sponsorshipItems = [
    { label: 'Team Sponsorship', icon: 'groups', desc: 'Sponsor a competition team' },
    { label: 'Student Sponsorship', icon: 'school', desc: 'Sponsor an individual student' },
    { label: 'Track Sponsorship', icon: 'category', desc: 'Sponsor an entire competition track' },
    { label: 'Mentorship Program', icon: 'psychology', desc: 'Fund a mentor session' },
    { label: 'Equipment & Tools', icon: 'construction', desc: 'Provide hardware / software' },
    { label: 'Prize & Awards', icon: 'emoji_events', desc: 'Fund championship prizes' }
  ];

  selectedPackages: string[] = [];

  togglePackage(label: string): void {
    if (this.selectedPackages.includes(label)) {
      this.selectedPackages = this.selectedPackages.filter(l => l !== label);
    } else {
      this.selectedPackages = [...this.selectedPackages, label];
    }
    this.sponsorForm.package = this.selectedPackages.join(', ');
  }

  isPackageSelected(label: string): boolean {
    return this.selectedPackages.includes(label);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    el.style.borderColor = 'var(--primary)';
    el.style.background = 'rgba(0, 63, 135, 0.08)';
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    el.style.borderColor = '';
    el.style.background = '';
  }

  onDropFile(event: DragEvent, field: string): void {
    event.preventDefault();
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    el.style.borderColor = '';
    el.style.background = '';
    const files = event.dataTransfer?.files;
    if (files?.length) {
      this.processFiles(files, field);
    }
  }

  private async processFiles(files: FileList, field: string): Promise<void> {
    const sizeLimits: Record<string, number> = {
      schoolLogo: 5 * 1024 * 1024,
      accredDocs: 10 * 1024 * 1024,
      instructorDocs: 10 * 1024 * 1024,
      sponsorLogo: 3 * 1024 * 1024,
      judgeLogo: 3 * 1024 * 1024,
      studentPhoto: 10 * 1024 * 1024,
      groupPhoto: 10 * 1024 * 1024,
      groupLogo: 10 * 1024 * 1024,
      memberLeadPhoto: 10 * 1024 * 1024,
      member2Photo: 10 * 1024 * 1024,
      member3Photo: 10 * 1024 * 1024,
      member4Photo: 10 * 1024 * 1024,
      member5Photo: 10 * 1024 * 1024,
      openRegPhoto: 2 * 1024 * 1024,
      openRegDocs: 5 * 1024 * 1024
    };
    const maxSize = sizeLimits[field] || 10 * 1024 * 1024;
    const ids: string[] = [];
    const names: string[] = [];
    for (const file of Array.from(files)) {
      if (file.size > maxSize) {
        console.warn(`[FileUpload] "${file.name}" size=${file.size} bytes (${(file.size / 1024).toFixed(1)} KB), limit=${maxSize} bytes (${Math.round(maxSize / (1024 * 1024))} MB)`);
        this.dialogService.toast(`"${file.name}" exceeds the maximum size of ${Math.round(maxSize / (1024 * 1024))}MB.`, 'warning');
        continue;
      }
      const id = this.fileStorage.generateId();
      await this.fileStorage.store(id, file);
      ids.push(id);
      names.push(file.name);
    }
    if (ids.length) {
      this.selectedFileIds[field] = [...(this.selectedFileIds[field] || []), ...ids];
      this.selectedFileNames[field] = [...(this.selectedFileNames[field] || []), ...names];
    }
    this.missingDocsError = '';

    if (field === 'schoolLogo') {
      this.loadSchoolLogo();
    } else if (field === 'judgeLogo') {
      this.loadJudgeLogo();
    } else if (field === 'sponsorLogo') {
      this.loadSponsorLogo();
    } else if (field === 'studentPhoto') {
      this.loadStudentPhoto();
    } else if (field === 'groupPhoto') {
      this.loadGroupPhoto();
    } else if (field === 'groupLogo') {
      this.loadGroupLogo();
    } else if (field.startsWith('member') && field.endsWith('Photo')) {
      this.loadMemberPhoto(field);
    } else if (field === 'openRegPhoto') {
      this.loadOpenRegPhoto();
    } else if (field === 'openRegDocs') {
      this.loadOpenRegDoc();
    }
  }

  async onFileSelected(event: any, field: string): Promise<void> {
    const files: FileList = event.target.files;
    if (files?.length) {
      const sizeLimits: Record<string, number> = {
        schoolLogo: 5 * 1024 * 1024,
        accredDocs: 10 * 1024 * 1024,
        instructorDocs: 10 * 1024 * 1024,
        sponsorLogo: 3 * 1024 * 1024,
        judgeLogo: 3 * 1024 * 1024,
        studentPhoto: 10 * 1024 * 1024,
        groupPhoto: 10 * 1024 * 1024,
        groupLogo: 10 * 1024 * 1024,
        memberLeadPhoto: 10 * 1024 * 1024,
        member2Photo: 10 * 1024 * 1024,
        member3Photo: 10 * 1024 * 1024,
        member4Photo: 10 * 1024 * 1024,
        member5Photo: 10 * 1024 * 1024
      };
      const maxSize = sizeLimits[field] || 10 * 1024 * 1024;
      const ids: string[] = [];
      const names: string[] = [];
      for (const file of Array.from(files)) {
        if (file.size > maxSize) {
          console.warn(`[FileUpload] "${file.name}" size=${file.size} bytes (${(file.size / 1024).toFixed(1)} KB), limit=${maxSize} bytes (${Math.round(maxSize / (1024 * 1024))} MB)`);
          this.dialogService.toast(`"${file.name}" exceeds the maximum size of ${Math.round(maxSize / (1024 * 1024))}MB.`, 'warning');
          continue;
        }
        const id = this.fileStorage.generateId();
        await this.fileStorage.store(id, file);
        ids.push(id);
        names.push(file.name);
      }
      if (ids.length) {
        this.selectedFileIds[field] = [...(this.selectedFileIds[field] || []), ...ids];
        this.selectedFileNames[field] = [...(this.selectedFileNames[field] || []), ...names];
      }
      this.missingDocsError = '';

      if (field === 'schoolLogo') {
        this.loadSchoolLogo();
      } else if (field === 'judgeLogo') {
        this.loadJudgeLogo();
      } else if (field === 'sponsorLogo') {
        this.loadSponsorLogo();
      } else if (field === 'studentPhoto') {
        this.loadStudentPhoto();
      } else if (field === 'groupPhoto') {
        this.loadGroupPhoto();
      } else if (field === 'groupLogo') {
        this.loadGroupLogo();
      } else if (field.startsWith('member') && field.endsWith('Photo')) {
        this.loadMemberPhoto(field);
      }
    }
    event.target.value = '';
  }

  private async loadSchoolLogo(): Promise<void> {
    const id = this.selectedFileIds['schoolLogo']?.[0];
    if (id) {
      this.schoolLogoUrl = await this.fileStorage.getUrl(id);
    }
  }

  private async loadJudgeLogo(): Promise<void> {
    const id = this.selectedFileIds['judgeLogo']?.[0];
    if (id) {
      this.judgeLogoUrl = await this.fileStorage.getUrl(id);
    }
  }

  private async loadSponsorLogo(): Promise<void> {
    const id = this.selectedFileIds['sponsorLogo']?.[0];
    if (id) {
      this.sponsorLogoUrl = await this.fileStorage.getUrl(id);
    }
  }

  private async loadStudentPhoto(): Promise<void> {
    const id = this.selectedFileIds['studentPhoto']?.[0];
    if (id) {
      this.studentPhotoUrl = await this.fileStorage.getUrl(id);
    }
  }

  private async loadGroupPhoto(): Promise<void> {
    const id = this.selectedFileIds['groupPhoto']?.[0];
    if (id) {
      this.groupPhotoUrl = await this.fileStorage.getUrl(id);
    }
  }

  private async loadGroupLogo(): Promise<void> {
    const id = this.selectedFileIds['groupLogo']?.[0];
    if (id) {
      this.groupLogoUrl = await this.fileStorage.getUrl(id);
    }
  }

  private async loadMemberPhoto(field: string): Promise<void> {
    const id = this.selectedFileIds[field]?.[0];
    if (id) {
      const memberKeyMap: Record<string, string> = { memberLeadPhoto: 'lead', member2Photo: 'm2', member3Photo: 'm3', member4Photo: 'm4', member5Photo: 'm5' };
      const key = memberKeyMap[field] || 'lead';
      this.memberPhotoUrls[key] = await this.fileStorage.getUrl(id);
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
    } else if (field === 'judgeLogo') {
      if (this.judgeLogoUrl) { this.fileStorage.revokeUrl(this.judgeLogoUrl); }
      this.judgeLogoUrl = null;
    } else if (field === 'sponsorLogo') {
      if (this.sponsorLogoUrl) { this.fileStorage.revokeUrl(this.sponsorLogoUrl); }
      this.sponsorLogoUrl = null;
    } else if (field === 'studentPhoto') {
      if (this.studentPhotoUrl) { this.fileStorage.revokeUrl(this.studentPhotoUrl); }
      this.studentPhotoUrl = null;
    } else if (field === 'groupPhoto') {
      if (this.groupPhotoUrl) { this.fileStorage.revokeUrl(this.groupPhotoUrl); }
    this.groupPhotoUrl = null;
    this.groupLogoUrl = null;
    } else if (field === 'groupLogo') {
      if (this.groupLogoUrl) { this.fileStorage.revokeUrl(this.groupLogoUrl); }
      this.groupLogoUrl = null;
    } else if (field.startsWith('member') && field.endsWith('Photo')) {
      const removeKeyMap: Record<string, string> = { memberLeadPhoto: 'lead', member2Photo: 'm2', member3Photo: 'm3', member4Photo: 'm4', member5Photo: 'm5' };
      const key = removeKeyMap[field] || 'lead';
      if (this.memberPhotoUrls[key]) { this.fileStorage.revokeUrl(this.memberPhotoUrls[key]!); }
      this.memberPhotoUrls[key] = null;
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
      switch (this.pendingTermsAction) {
        case 'school': this.schoolForm.acceptedTerms = true; break;
        case 'instructor': this.instructorForm.acceptedTerms = true; break;
        case 'judge': this.judgeForm.acceptedTerms = true; break;
        case 'sponsor': this.sponsorForm.acceptedTerms = true; break;
      }
    }
    this.closeTermsModal();
  }

  openPrivacyModal(): void {
    this.showPrivacyModal = true;
  }

  closePrivacyModal(): void {
    this.showPrivacyModal = false;
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    public themeService: ThemeService,
    public contentService: ContentService,
    public fileStorage: FileStorageService,
    private emailService: BrevoEmailService,
    private smsService: SmsService,
    private notificationService: NotificationService,
    public dialogService: DialogService,
    private apiService: ApiService
  ) {}

  logoUrls: Record<string, string> = {};

  async loadLogo(fileId: string): Promise<string> {
    if (this.logoUrls[fileId]) return this.logoUrls[fileId];
    const url = await this.fileStorage.getUrl(fileId);
    if (url) { this.logoUrls[fileId] = url; return url; }
    return '';
  }

  isLoginModalOpen = false;
  loginEmail = '';
  loginPassword = '';
  isLoggingIn = false;
  loginError = '';
  isPasswordVisible = false;
  rememberDevice = false;

  openLoginModal(): void {
    this.isLoginModalOpen = true;
    this.loginError = '';
    const creds = getRememberedCredentials();
    if (creds.remembered) {
      this.rememberDevice = true;
      this.loginEmail = creds.username;
      this.loginPassword = creds.password;
    } else {
      this.loginEmail = '';
      this.loginPassword = '';
      this.rememberDevice = false;
    }
  }

  closeLoginModal(): void {
    this.isLoginModalOpen = false;
    this.loginEmail = '';
    this.loginPassword = '';
    this.loginError = '';
  }

  get hasSavedCredentials(): boolean {
    return hasRememberedDevice();
  }

  clearSavedCredentials(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    forgetRememberedCredentials();
    this.loginEmail = '';
    this.loginPassword = '';
    this.rememberDevice = false;
    this.dialogService.toast('Saved credentials cleared from this device.', 'info');
  }

  performLogin(): void {
    if (!this.loginEmail.trim()) {
      this.loginError = 'Please enter your email or access pass.';
      return;
    }
    this.isLoggingIn = true;
    this.loginError = '';

    const credential = this.loginEmail.trim().toLowerCase();
    const pass = this.loginPassword.trim();

    this.apiService.login(credential, pass).subscribe({
      next: (res) => this.completeLogin(res.role, res, credential),
      error: (err) => {
        if (err.status === 0 || err.status === 502 || err.status === 503 || err.name === 'TimeoutError') {
          this.isLoggingIn = false;
          this.loginError = 'Server unreachable. Please try again once the server is online.';
        } else if (err.status === 401) {
          this.isLoggingIn = false;
          this.loginError = 'Incorrect email or password. Please try again.';
        } else {
          this.isLoggingIn = false;
          this.loginError = 'Login is unavailable right now. Please try again later.';
        }
      }
    });
  }

  private completeLogin(role: string, user: any, credential: string): void {
    this.isLoggingIn = false;
    const email = user.email || credential;
    const ticket = user.ticket || credential;

    setAuthValue('activeRoleId', role, this.rememberDevice);
    setAuthValue('activeUserEmail', email, this.rememberDevice);
    setAuthValue('activeUserTicket', ticket, this.rememberDevice);
    if (user.fullName) {
      setAuthValue('activeUserName', user.fullName, this.rememberDevice);
    }
    if (user.token) {
      setAuthValue('activeUserToken', user.token, this.rememberDevice);
    }

    // Save or clear remembered credentials without auto-logging in
    saveRememberedCredentials(credential, this.loginPassword.trim(), this.rememberDevice);
    this.contentService.saveAuditLogs([
      { action: `${role} login: ${email}`, user: email, time: new Date().toISOString(), type: 'auth' },
      ...this.contentService.auditLogs
    ]);

    const roleRoutes: Record<string, string> = {
      instructor: '/instructor',
      judge: '/dashboard',
      student: '/lms',
      school_admin: '/dashboard',
      sponsor: '/sponsors',
      super_admin: '/dashboard',
      content_manager: '/dashboard',
      reviewer: '/dashboard',
      competition_manager: '/dashboard'
    };

    this.isLoginModalOpen = false;
    if ((role === 'judge' || role === 'sponsor') && (user.organization === '_pending_profile' || user.organization === '')) {
      this.router.navigate(['/profile-completion']);
    } else {
      this.router.navigate([roleRoutes[role] || '/dashboard']);
    }
  }

  getLogoUrl(details: any): string {
    if (details?.logoFileId && this.logoUrls[details.logoFileId]) return this.logoUrls[details.logoFileId];
    return '';
  }

  ngOnInit(): void {
    this.purgeExpiredDrafts();
    const activeRoleId = getAuthValue('activeRoleId');
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
        // Fresh visit (no tab/track param) -- always show the gateway
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
    this.clearRegState();
  }

  selectContinueRegistration(): void {
    this.regState = 'continue_select';
    this.clearRegState();
    this.verificationInput = '';
    this.otpCode = '';
    this.otpError = '';
  }

  openTracker(): void {
    this.regState = 'tracker';
    this.clearRegState();
    this.trackerQuery = '';
    this.trackerResult = null;
    this.trackerStatus = 'idle';
    this.trackerSearched = false;
  }

  generateApplicationCode(type: 'school' | 'team' | 'instructor' | 'student'): string {
    const prefix = type === 'school' ? 'SCH' : type === 'team' ? 'TM' : type === 'student' ? 'STU' : 'INS';
    const year = new Date().getFullYear();
    const block = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `NTIC-${prefix}-${year}-${block}`;
  }

  copyApplicationCode(): void {
    if (!this.lastApplicationCode) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(this.lastApplicationCode).then(() => {
        this.copiedApplicationCode = true;
        setTimeout(() => this.copiedApplicationCode = false, 2000);
      }).catch(() => this.fallbackCopy(this.lastApplicationCode!));
    } else {
      this.fallbackCopy(this.lastApplicationCode);
    }
  }

  private fallbackCopy(text: string): void {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    this.copiedApplicationCode = true;
    setTimeout(() => this.copiedApplicationCode = false, 2000);
  }

  searchApplication(): void {
    if (!this.trackerQuery.trim()) return;
    const result = this.contentService.lookupApplication(this.trackerQuery);
    this.trackerResult = result;
    this.trackerStatus = result.status;
    this.trackerSearched = true;
  }

  startEditApplication(): void {
    const app = this.trackerResult?.application;
    if (!app) return;
    this.editingApprovalId = app.id;
    this.justUpdatedApplication = false;
    this.loadApprovalIntoForm(app);
    this.regState = 'new';
    this.isDraftResumed = false;
    this.saveRegState();
  }

  private loadApprovalIntoForm(app: any): void {
    const d = app.details || {};
    this.clearDraftPrefills();
    if (app.type === 'School Registration') {
      this.activeTab = 'school';
      this.schoolForm = {
        name: app.entity || '',
        category: d.category || 'Public High School',
        region: d.region || 'Greater Accra',
        district: d.district || '',
        tel: d.phone || '',
        email: d.email || '',
        gps: d.gps || '',
        repName: d.repName || '',
        repEmail: d.repEmail || '',
        repTel: d.repTel || '',
        students: d.students || [],
        teams: d.teamsList || [],
        acceptedTerms: true
      };
      this.gpsAddress = d.gpsAddress || '';
      this.schoolStep = 1;
      this.maxSchoolStepReached = 4;
      if (d.docs?.length) {
        this.selectedFileIds['accredDocs'] = d.docs.map((x: string) => x.split('::')[0]);
        this.selectedFileNames['accredDocs'] = d.docs.map((x: string) => x.split('::')[1] || 'document.pdf');
      }
      if (d.logoFileId) {
        this.selectedFileIds['schoolLogo'] = [d.logoFileId];
        this.selectedFileNames['schoolLogo'] = ['School Logo'];
        this.loadSchoolLogo();
      }
    } else if (app.type === 'Team Addition') {
      this.activeTab = 'student';
      this.competitorMode = 'group';
      const members = d.members || [];
      this.teamForm = {
        name: app.entity || '',
        school: d.school || '',
        region: d.region || 'Greater Accra',
        track: d.track || '',
        leadName: members[0] || '',
        leadEmail: app.contact || '',
        member2Name: members[1] || '',
        member2Email: '',
        member3Name: members[2] || '',
        member3Email: '',
        member4Name: members[3] || '',
        member4Email: '',
        member5Name: members[4] || '',
        member5Email: '',
        skills: { alg: 'intermediate', hw: 'novice', ai: 'novice' }
      };
    } else if (app.type === 'Student Registration') {
      this.activeTab = 'student';
      this.competitorMode = 'individual';
      this.selectedTrack = d.track || '';
      this.studentForm = {
        name: app.entity || '',
        id: d.id || '',
        email: app.contact || '',
        dob: d.dob || '',
        gender: d.gender || '',
        school: d.school || '',
        class: d.class || '',
        guardianName: d.guardianName || '',
        guardianPhone: d.guardianPhone || '',
        region: d.region || 'Greater Accra',
        track: d.track || '',
        skills: { alg: 'intermediate', hw: 'novice', ai: 'novice' }
      };
      if (d.photoFileId) {
        this.selectedFileIds['studentPhoto'] = [d.photoFileId];
        this.selectedFileNames['studentPhoto'] = ['Student Photo'];
        this.loadStudentPhoto();
      }
    } else if (app.type === 'Instructor Access') {
      this.activeTab = 'instructor';
      const expertiseMap: Record<string, boolean> = { Python: false, JavaScript: false, 'C#': false, AI: false, Robotics: false, 'Networking & Cybersecurity': false, 'Data Science': false };
      (d.specialization || '').split(',').forEach((s: string) => {
        const k = s.trim();
        if (k in expertiseMap) expertiseMap[k] = true;
      });
      this.instructorForm = {
        name: app.entity || '',
        tel: d.phone || '',
        email: app.contact || '',
        address: d.address || '',
        region: d.region || 'Greater Accra',
        qualification: d.credentials || 'BSc',
        institution: d.institution === 'Independent Mentor' ? '' : (d.institution || ''),
        isIndependent: !!d.isIndependent,
        acceptedTerms: true,
        portfolio: d.portfolio || '',
        expertise: expertiseMap
      };
      if (d.docs?.length) {
        this.selectedFileIds['instructorDocs'] = d.docs.map((x: string) => x.split('::')[0]);
        this.selectedFileNames['instructorDocs'] = d.docs.map((x: string) => x.split('::')[1] || 'document.pdf');
      }
    }
  }

  goBackToGatewayFromTracker(): void {
    this.regState = 'gateway';
    this.clearRegState();
    this.trackerQuery = '';
    this.trackerResult = null;
    this.trackerStatus = 'idle';
    this.trackerSearched = false;
    this.editingApprovalId = null;
  }

  goBackToGateway(): void {
    this.isPathModalOpen = false;
    this.regState = 'gateway';
    this.clearRegState();
    this.clearTimer();
    this.editingApprovalId = null;
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

    const rawInput = this.verificationInput.trim();
    const inputKey = rawInput.toLowerCase();
    const drafts = JSON.parse(localStorage.getItem('ntic_drafts') || '{}');
    const draftKey = this.resolveDraftKey(drafts, rawInput, inputKey);

    if (!draftKey) {
      this.otpError = 'No saved draft found for this ' + this.verificationMethod + '. Please check and try again, or start a new registration.';
      return;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpStore = {
      code: otp,
      contact: draftKey,
      expiresAt: Date.now() + 5 * 60 * 1000
    };
    localStorage.setItem('ntic_otp', JSON.stringify(otpStore));

    this.otpError = '';
    this.otpCode = '';
    this.regState = 'otp_verification';
    this.startResendTimer();

    // Deliver the code: the email channel sends to the typed email; the mobile
    // channel (no SMS service) sends to the draft owner's email. The code is
    // also shown as a fallback so resuming is never blocked by email delivery.
    const targetEmail = this.verificationMethod === 'email' && rawInput.includes('@') ? rawInput : draftKey;
    try {
      this.emailService.sendOtpEmail(targetEmail, otp);
    } catch { /* ignore */ }

    this.showCustomAlert(
      `A 6-digit verification code has been sent to ${targetEmail}.`,
      'Verification Code Sent', 'info'
    );
  }

  private resolveDraftKey(drafts: Record<string, any>, rawInput: string, inputKey: string): string | null {
    if (drafts[inputKey]) return inputKey;
    const needle = rawInput.replace(/\s+/g, '').toLowerCase();
    if (!needle) return null;
    for (const key of Object.keys(drafts)) {
      const data = drafts[key]?.data;
      if (data && typeof data === 'object' && JSON.stringify(data).replace(/\s+/g, '').toLowerCase().includes(needle)) {
        return key;
      }
    }
    return null;
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
      try {
        this.emailService.sendOtpEmail(stored.contact || this.verificationInput, otp);
      } catch { /* ignore */ }
      this.showCustomAlert(`New verification code sent.`, 'Code Resent', 'info');
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
      this.saveRegState();
    }, 2200);
  }

  cardSubTab = 'profile'; // 'profile' | 'roster' | 'docs'

  goToStep(step: number): void {
    if (step <= this.maxSchoolStepReached) {
      this.schoolStep = step;
      this.syncCardSubTab(step);
      this.saveRegState();
    }
  }

  nextStep(step: number): void {
    if (step === this.schoolStep + 1) {
      this.schoolStep = step;
      if (step > this.maxSchoolStepReached) {
        this.maxSchoolStepReached = step;
      }
      this.syncCardSubTab(step);
      this.saveRegState();
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
      id: this.studentForm.id,
      name: this.studentForm.name,
      dob: this.studentForm.dob,
      gender: this.studentForm.gender,
      class: this.studentForm.class,
      guardianName: this.studentForm.guardianName,
      guardianPhone: this.studentForm.guardianPhone,
      track: this.selectedTrack,
      skills: { ...this.studentForm.skills }
    });
    this.studentForm.id = '';
    this.studentForm.name = '';
    this.studentForm.guardianName = '';
    this.studentForm.guardianPhone = '';
  }

  removeStudent(index: number): void {
    this.schoolForm.students.splice(index, 1);
  }

  addTeam(): void {
    if (!this.teamForm.name) {
      this.showCustomAlert('Please enter team name.', 'Validation Error', 'warning');
      return;
    }
    const memberPhotoIds: string[] = [];
    ['memberLeadPhoto', 'member2Photo', 'member3Photo', 'member4Photo', 'member5Photo'].forEach(k => {
      const id = this.selectedFileIds[k]?.[0];
      if (id) memberPhotoIds.push(id);
    });
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
      member5Email: this.teamForm.member5Email,
      memberPhotos: memberPhotoIds.length ? memberPhotoIds : undefined
    });
    this.teamForm.name = '';
    this.teamForm.school = '';
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
    // Clear member photos
    ['memberLeadPhoto', 'member2Photo', 'member3Photo', 'member4Photo', 'member5Photo'].forEach(k => {
      const id = this.selectedFileIds[k]?.[0];
      if (id) { this.fileStorage.remove(id); }
    });
    const urlKeys = ['lead', 'm2', 'm3', 'm4', 'm5'];
    urlKeys.forEach(k => { if (this.memberPhotoUrls[k]) { this.fileStorage.revokeUrl(this.memberPhotoUrls[k]!); } });
    this.selectedFileIds['memberLeadPhoto'] = [];
    this.selectedFileIds['member2Photo'] = [];
    this.selectedFileIds['member3Photo'] = [];
    this.selectedFileIds['member4Photo'] = [];
    this.selectedFileIds['member5Photo'] = [];
    this.selectedFileNames['memberLeadPhoto'] = [];
    this.selectedFileNames['member2Photo'] = [];
    this.selectedFileNames['member3Photo'] = [];
    this.selectedFileNames['member4Photo'] = [];
    this.selectedFileNames['member5Photo'] = [];
    this.memberPhotoUrls = { lead: null, m2: null, m3: null, m4: null, m5: null };
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
      // Validate all provided emails
      const teamEmails = [this.teamForm.leadEmail, this.teamForm.member2Email, this.teamForm.member3Email, this.teamForm.member4Email, this.teamForm.member5Email].filter(e => e?.trim());
      const lowerEmails = teamEmails.map(e => e!.trim().toLowerCase());
      const dupEmail = lowerEmails.find((e, i) => lowerEmails.indexOf(e) !== i);
      if (dupEmail) {
        this.showCustomAlert(`The email "${dupEmail}" is used multiple times in this form. Each team member must have a unique email.`, 'Duplicate Email', 'warning');
        return;
      }
      for (const email of teamEmails) {
        if (!this.contentService.isValidEmail(email!)) {
          this.showCustomAlert('One or more team emails have invalid format. Please check.', 'Invalid Email', 'warning');
          return;
        }
        if (this.contentService.isEmailTaken(email!, this.editingApprovalId || undefined)) {
          this.showCustomAlert(`The email "${email}" is already registered. Please use a different email.`, 'Email Taken', 'warning');
          return;
        }
      }
      const ticket = `NTIC-GRP-${Math.floor(1000 + Math.random() * 9000)}`;
      const leadEmail = this.teamForm.leadEmail?.trim() || `${ticket.toLowerCase()}@squad.ntic.gh`;
      if (this.teamForm.leadEmail?.trim() && this.contentService.isEmailTaken(leadEmail, this.editingApprovalId || undefined)) {
        this.showCustomAlert('An account with this Team Lead email already exists. Please log in instead.', 'Account Exists', 'warning');
        return;
      }

      if (this.editingApprovalId) {
        const rosterList = [this.teamForm.leadName, this.teamForm.member2Name, this.teamForm.member3Name, this.teamForm.member4Name, this.teamForm.member5Name].filter(Boolean).map((n: string) => n.trim()).filter((n: string) => n.length > 0);
        const currentApprovals = [...this.contentService.pendingApprovals];
        const idx = currentApprovals.findIndex(a => a.id === this.editingApprovalId);
        if (idx > -1) {
          currentApprovals[idx] = {
            ...currentApprovals[idx],
            type: 'Team Addition',
            entity: this.teamForm.name,
            contact: leadEmail,
            submitted: 'Updated ' + new Date().toLocaleString('en-GB'),
            details: {
              school: this.teamForm.school,
              region: this.teamForm.region,
              track: this.teamForm.track,
              project: this.teamForm.name + ' Sandbox Project',
              members: rosterList,
              memberEmails: [this.teamForm.leadEmail, this.teamForm.member2Email, this.teamForm.member3Email, this.teamForm.member4Email, this.teamForm.member5Email].filter(Boolean),
              leadEmail,
              coach: 'Instructor assigned by ' + (this.teamForm.school || 'Registered Institution'),
              code: currentApprovals[idx].details?.code || this.generateApplicationCode('team')
            }
          };
        this.contentService.saveApprovals(currentApprovals);

        // Also persist to backend so other machines see pending approvals
        const latestApproval = currentApprovals[0];
        if (latestApproval) {
          this.apiService.createApproval({
            id: latestApproval.id,
            type: latestApproval.type,
            entity: latestApproval.entity,
            contact: latestApproval.contact,
            submitted: latestApproval.submitted,
            details: latestApproval.details,
            status: 'pending'
          }).subscribe({ next: () => {}, error: () => {} });
        }

          const currentAudit = [...this.contentService.auditLogs];
          currentAudit.unshift({
            action: `Application updated (Team Addition): ${this.teamForm.name}`,
            user: leadEmail,
            time: new Date().toISOString(),
            type: 'approval'
          });
          this.contentService.saveAuditLogs(currentAudit);

          this.justUpdatedApplication = true;
          this.editingApprovalId = null;
          this.lastApplicationCode = currentApprovals[idx].details?.code || null;
          this.copiedApplicationCode = false;
          this.isSuccessModalOpen = true;
          this.clearDraftPrefills();
        }
        return;
      }

      const membersList = [
        { name: this.teamForm.leadName, email: leadEmail, role: 'Lead' },
        ...(this.teamForm.member2Name ? [{ name: this.teamForm.member2Name, email: this.teamForm.member2Email, role: 'Member' }] : []),
        ...(this.teamForm.member3Name ? [{ name: this.teamForm.member3Name, email: this.teamForm.member3Email, role: 'Member' }] : []),
        ...(this.teamForm.member4Name ? [{ name: this.teamForm.member4Name, email: this.teamForm.member4Email, role: 'Member' }] : []),
        ...(this.teamForm.member5Name ? [{ name: this.teamForm.member5Name, email: this.teamForm.member5Email, role: 'Member' }] : [])
      ];

      const memberPhotoIds: string[] = [];
      ['memberLeadPhoto', 'member2Photo', 'member3Photo', 'member4Photo', 'member5Photo'].forEach(k => {
        const id = this.selectedFileIds[k]?.[0];
        if (id) memberPhotoIds.push(id);
      });

      const code = this.generateApplicationCode('team');
      const details: any = {
        school: this.teamForm.school || '',
        region: this.teamForm.region,
        track: this.teamForm.track || 'Coding',
        project: this.teamForm.name + ' Sandbox Project',
        members: membersList.map(m => m.name),
        memberEmails: membersList.map(m => m.email).filter(Boolean),
        leadEmail,
        coach: 'Instructor assigned by ' + (this.teamForm.school || 'Registered Institution'),
        code,
        photoFileId: this.selectedFileIds['groupPhoto']?.[0] || undefined,
        logoFileId: this.selectedFileIds['groupLogo']?.[0] || undefined,
        memberPhotos: memberPhotoIds.length ? memberPhotoIds : undefined,
        skills: { ...this.teamForm.skills }
      };

      const currentApprovals = [...this.contentService.pendingApprovals];
      currentApprovals.unshift({
        id: 'REQ-' + Date.now(),
        type: 'Team Addition',
        entity: this.teamForm.name,
        contact: leadEmail,
        submitted: 'Just now',
        details
      });
      this.contentService.saveApprovals(currentApprovals);

      if (leadEmail) {
        this.emailService.sendPendingConfirmation(leadEmail, this.teamForm.leadName, this.teamForm.name, 'Team Addition');
      }

      const currentAudit = [...this.contentService.auditLogs];
      currentAudit.unshift({
        action: `New Team Addition requested: ${this.teamForm.name}`,
        user: leadEmail,
        time: new Date().toISOString(),
        type: 'approval'
      });
      this.contentService.saveAuditLogs(currentAudit);

      this.justUpdatedApplication = false;
      this.editingApprovalId = null;
      this.lastApplicationCode = code;
      this.copiedApplicationCode = false;
      this.isSuccessModalOpen = true;
      this.clearDraftPrefills();
      return;
    }

    // Individual Competitor
    if (!this.studentForm.name) {
      this.showCustomAlert('Please enter your full name to register.', 'Validation Error', 'warning');
      return;
    }
    const ticket = `NTIC-STU-${Math.floor(1000 + Math.random() * 9000)}`;
    const studentEmail = this.studentForm.email?.trim() || `${ticket.toLowerCase()}@stu.ntic.gh`;
    if (this.contentService.isEmailTaken(studentEmail, this.editingApprovalId || undefined)) {
      this.showCustomAlert('An account with this email already exists. Please log in instead.', 'Account Exists', 'warning');
      return;
    }
    const code = this.editingApprovalId
      ? (this.contentService.pendingApprovals.find(a => a.id === this.editingApprovalId)?.details?.code || this.generateApplicationCode('student'))
      : this.generateApplicationCode('student');
    const details: any = {
      region: this.studentForm.region,
      school: this.studentForm.school || '',
      class: this.studentForm.class || '',
      dob: this.studentForm.dob || '',
      gender: this.studentForm.gender || '',
      guardianName: this.studentForm.guardianName || '',
      guardianPhone: this.studentForm.guardianPhone || '',
      track: this.selectedTrack || '',
      skills: { ...this.studentForm.skills },
      code
    };
    const photoFileId = this.selectedFileIds['studentPhoto']?.[0];
    if (photoFileId) details.photoFileId = photoFileId;

    const currentApprovals = [...this.contentService.pendingApprovals];
    if (this.editingApprovalId) {
      const idx = currentApprovals.findIndex(a => a.id === this.editingApprovalId);
      if (idx > -1) {
        currentApprovals[idx] = {
          ...currentApprovals[idx],
          type: 'Student Registration',
          entity: this.studentForm.name,
          contact: studentEmail,
          submitted: 'Updated ' + new Date().toLocaleString('en-GB'),
          details
        };
      } else {
        currentApprovals.unshift({
          id: 'REQ-' + Date.now(),
          type: 'Student Registration',
          entity: this.studentForm.name,
          contact: studentEmail,
          submitted: 'Just now',
          details
        });
      }
    } else {
      currentApprovals.unshift({
        id: 'REQ-' + Date.now(),
        type: 'Student Registration',
        entity: this.studentForm.name,
        contact: studentEmail,
        submitted: 'Just now',
        details
      });
    }
    this.contentService.saveApprovals(currentApprovals);

    if (studentEmail) {
      this.emailService.sendPendingConfirmation(studentEmail, this.studentForm.name, this.studentForm.name, 'Student Registration');
    }

    const currentAudit = [...this.contentService.auditLogs];
    currentAudit.unshift({
      action: this.editingApprovalId ? `Application updated (Student Registration): ${this.studentForm.name}` : `New Student Registration requested: ${this.studentForm.name}`,
      user: studentEmail,
      time: new Date().toISOString(),
      type: 'approval'
    });
    this.contentService.saveAuditLogs(currentAudit);

    this.justUpdatedApplication = !!this.editingApprovalId;
    this.editingApprovalId = null;
    this.lastApplicationCode = code;
    this.copiedApplicationCode = false;
    this.isSuccessModalOpen = true;
    this.clearDraftPrefills();
  }

  detectGps(): void {
    if (!navigator.geolocation) {
      this.schoolForm.gps = '5.6037, -0.1870';
      this.gpsAddress = 'Accra, Greater Accra, Ghana (fallback)';
      this.gpsAccuracyWarning = 'Geolocation not available -- location set to Accra. You can edit the coordinates manually.';
      return;
    }
    this.gpsLoading = true;
    this.gpsAddress = '';
    this.gpsAccuracyWarning = '';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        this.schoolForm.gps = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        if (pos.coords.accuracy > 1000) {
          this.gpsAccuracyWarning = `Low accuracy (~${Math.round(pos.coords.accuracy)}m). This may be based on WiFi/IP, not GPS. Edit the coordinates if incorrect.`;
        } else {
          this.gpsAccuracyWarning = '';
        }
        this.reverseGeocode(lat, lng);
      },
      () => {
        this.schoolForm.gps = '5.6037, -0.1870';
        this.gpsAddress = 'Accra, Greater Accra, Ghana (fallback)';
        this.gpsAccuracyWarning = 'Location detection failed -- set to Accra. You can edit the coordinates manually.';
        this.gpsLoading = false;
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  }

  onGpsManualEdit(): void {
    this.gpsAccuracyWarning = '';
    const match = this.schoolForm.gps.match(/([-\d.]+)\s*,\s*([-\d.]+)/);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        this.reverseGeocode(lat, lng);
      }
    }
  }

  private reverseGeocode(lat: number, lng: number): void {
    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`)
      .then(res => res.json())
      .then((data: any) => {
        const a = data.address || {};
        const parts = [a.road, a.suburb || a.neighbourhood, a.city || a.town || a.village, a.state || a.region, a.country].filter(Boolean);
        this.gpsAddress = parts.join(', ') || data.display_name || '';
        const detectedDistrict = a.county || a.state_district || a.district || '';
        if (detectedDistrict && !this.schoolForm.district) {
          this.schoolForm.district = detectedDistrict;
        }
        this.gpsLoading = false;
      })
      .catch(() => {
        this.gpsAddress = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        this.gpsLoading = false;
      });
  }

  loadOpenCompetitions(): void {
    this.availableOpenCompetitions = this.contentService.competitions
      .filter(c => c.status === 'registration' || c.status === 'active')
      .map(c => ({
        id: c.id,
        title: c.title,
        track: c.track,
        type: c.type,
        deadline: c.deadline,
        teams: c.teams,
        maxTeams: c.maxTeams,
        prize: c.prize,
        status: c.status
      }));
  }

  getSelectedCompetition(): any {
    return this.availableOpenCompetitions.find(c => c.id === this.openRegForm.selectedCompetitionId) || null;
  }

  sendOpenVerificationCode(): void {
    if (!this.openRegForm.email) return;
    if (!this.contentService.isValidEmail(this.openRegForm.email)) {
      this.dialogService.toast('Please enter a valid email address.', 'error');
      return;
    }
    this.apiService.verifyContact({ email: this.openRegForm.email }).subscribe({
      next: (res) => {
        if (res.email_available) {
          this.openRegForm.emailVerified = true;
          this.dialogService.toast('Email verified -- not already registered.', 'success');
        } else {
          this.dialogService.toast('This email is already registered.', 'error');
        }
      },
      error: () => this.dialogService.toast('Verification unavailable. Try again later.', 'warning')
    });
  }

  sendOpenPhoneVerification(): void {
    if (!this.openRegForm.phone) return;
    this.apiService.verifyContact({ phone: this.openRegForm.phone }).subscribe({
      next: (res) => {
        if (res.phone_available) {
          this.openRegForm.phoneVerified = true;
          this.dialogService.toast('Phone verified -- not already registered.', 'success');
        } else {
          this.dialogService.toast('This phone number is already registered.', 'error');
        }
      },
      error: () => {
        if (this.contentService.isPhoneTaken(this.openRegForm.phone)) {
          this.dialogService.toast('This phone number is already registered locally.', 'error');
        } else {
          this.openRegForm.phoneVerified = true;
          this.dialogService.toast('Phone verified (offline check).', 'success');
        }
      }
    });
  }

  onOpenRegPhotoSelected(event: any): void {
    const files = event.target?.files;
    if (files?.length) {
      this.processFiles(files, 'openRegPhoto');
    }
  }

  onOpenRegDocSelected(event: any): void {
    const files = event.target?.files;
    if (files?.length) {
      this.processFiles(files, 'openRegDocs');
    }
  }

  removeOpenRegPhoto(): void {
    this.openRegPhotoUrl = null;
    this.openRegPhotoFileId = null;
    this.selectedFileIds['openRegPhoto'] = [];
    this.selectedFileNames['openRegPhoto'] = [];
  }

  removeOpenRegDoc(): void {
    this.openRegDocName = null;
    this.openRegDocFileId = null;
    this.selectedFileIds['openRegDocs'] = [];
    this.selectedFileNames['openRegDocs'] = [];
  }

  async loadOpenRegPhoto(): Promise<void> {
    const ids = this.selectedFileIds['openRegPhoto'] || [];
    if (ids.length) {
      const file = await this.fileStorage.get(ids[ids.length - 1]);
      if (file?.blob) {
        this.openRegPhotoUrl = URL.createObjectURL(file.blob);
        this.openRegPhotoFileId = ids[ids.length - 1];
      }
    }
  }

  async loadOpenRegDoc(): Promise<void> {
    const names = this.selectedFileNames['openRegDocs'] || [];
    const ids = this.selectedFileIds['openRegDocs'] || [];
    if (names.length) {
      this.openRegDocName = names[names.length - 1];
      this.openRegDocFileId = ids[ids.length - 1];
    }
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
        formData = { ...this.schoolForm, selectedFileIds: this.selectedFileIds, selectedFileNames: this.selectedFileNames };
        break;
      case 'instructor':
        contact = this.instructorForm.email;
        formData = { ...this.instructorForm };
        break;
      case 'student':
        if (this.competitorMode === 'group') {
          contact = this.teamForm.leadEmail || '';
          formData = { ...this.teamForm, competitorMode: 'group' };
        } else {
          contact = this.studentForm.email;
          formData = { ...this.studentForm, selectedTrack: this.selectedTrack };
        }
        break;
      case 'judge':
        contact = this.judgeForm.email;
        formData = { ...this.judgeForm, selectedFileIds: this.selectedFileIds, selectedFileNames: this.selectedFileNames };
        break;
      case 'sponsor':
        contact = this.sponsorForm.email;
        formData = { ...this.sponsorForm, selectedFileIds: this.selectedFileIds, selectedFileNames: this.selectedFileNames };
        break;
      case 'team':
        contact = this.teamForm.leadEmail;
        formData = { ...this.teamForm };
        break;
      case 'open':
        contact = this.openRegForm.email;
        formData = { ...this.openRegForm };
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
    this.apiService.saveDraft({ email: contactKey, data: { tab: this.activeTab, data: formData, savedAt: new Date().toISOString() } }).subscribe();
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
      this.activeTab = 'sponsor';
      this.isDraftResumed = false;
      this.regState = 'new';
      this.saveRegState();
      return;
    }
    if (role === 'student') {
      this.activeTab = 'student';
      this.studentForm = {
        name: '',
        id: '',
        email: '',
        dob: '',
        gender: '',
        school: '',
        class: '',
        guardianName: '',
        guardianPhone: '',
        region: 'Greater Accra',
        track: '',
        skills: {
          alg: 'intermediate',
          hw: 'novice',
          ai: 'novice'
        }
      };
      this.teamForm = {
        name: '',
        school: '',
        region: 'Greater Accra',
        track: '',
        leadName: '',
        leadEmail: '',
        member2Name: '',
        member2Email: '',
        member3Name: '',
        member3Email: '',
        member4Name: '',
        member4Email: '',
        member5Name: '',
        member5Email: '',
        skills: { alg: 'intermediate', hw: 'novice', ai: 'novice' }
      };
      this.regState = 'new';
      this.saveRegState();
      return;
    }
    if (role === 'open') {
      this.activeTab = 'open';
      this.openRegForm = {
        fullName: '',
        email: '',
        phone: '',
        ageGroup: 'junior',
        experienceLevel: 'beginner',
        organization: '',
        selectedCompetitionId: '',
        acceptedTerms: false,
        emailVerified: false,
        phoneVerified: false
      };
      this.openRegPhotoUrl = null;
      this.openRegDocName = null;
      this.openRegPhotoFileId = null;
      this.openRegDocFileId = null;
      this.loadOpenCompetitions();
      this.regState = 'new';
      this.saveRegState();
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
        region: 'Greater Accra',
        qualification: 'BSc',
        institution: '',
        isIndependent: false,
        acceptedTerms: false,
        portfolio: '',
        expertise: {
          Python: false,
          JavaScript: false,
          'C#': false,
          AI: false,
          Robotics: false,
          'Networking & Cybersecurity': false,
          'Data Science': false
        }
      };
    } else if (role === 'judge') {
      this.judgeForm = {
        name: '',
        tel: '',
        email: '',
        organization: '',
        region: 'Greater Accra',
        expertise: '',
        experience: '',
        bio: '',
        ticketCode: '',
        otp: '',
        acceptedTerms: false
      };
    }
    this.regState = 'new';
    this.saveRegState();
  }

  private clearTimer(): void {
    if (this.resendInterval) {
      clearInterval(this.resendInterval);
    }
  }

  private saveRegState(): void {
    try {
      localStorage.setItem('ntic_reg_ui', JSON.stringify({
        regState: this.regState,
        activeTab: this.activeTab,
        schoolStep: this.schoolStep,
        maxSchoolStepReached: this.maxSchoolStepReached,
      }));
    } catch {}
  }

  private clearRegState(): void {
    localStorage.removeItem('ntic_reg_ui');
  }

  private clearDraftPrefills(): void {
    this.isDraftResumed = false;
    this.schoolStep = 1;
    this.maxSchoolStepReached = 1;
    this.gpsAddress = '';

    // Clear uploaded files & document state
    this.selectedFileIds = {};
    this.selectedFileNames = {};
    this.schoolLogoUrl = null;
    this.judgeLogoUrl = null;
    this.sponsorLogoUrl = null;
    this.studentPhotoUrl = null;
    this.groupPhotoUrl = null;
    this.missingDocsError = '';

    // Clear validation states
    this.clearValidationState();

    // Clear form models back to clean initial state
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

    this.instructorForm = {
      name: '',
      tel: '',
      email: '',
      address: '',
      region: 'Greater Accra',
      qualification: 'BSc',
      institution: '',
      isIndependent: false,
      acceptedTerms: false,
      portfolio: '',
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

    this.studentForm = {
      name: '',
      id: '',
      email: '',
      dob: '',
      gender: '',
      school: '',
      class: '',
      guardianName: '',
      guardianPhone: '',
      region: 'Greater Accra',
      track: '',
      skills: {
        alg: 'intermediate',
        hw: 'novice',
        ai: 'novice'
      }
    };

    this.teamForm = {
      name: '',
      school: '',
      region: 'Greater Accra',
      track: '',
      leadName: '',
      leadEmail: '',
      member2Name: '',
      member2Email: '',
      member3Name: '',
      member3Email: '',
      member4Name: '',
      member4Email: '',
      member5Name: '',
      member5Email: '',
      skills: { alg: 'intermediate', hw: 'novice', ai: 'novice' }
    };

    this.judgeForm = {
      name: '',
      tel: '',
      email: '',
      organization: '',
      region: 'Greater Accra',
      expertise: '',
      experience: '',
      bio: '',
      ticketCode: '',
      otp: '',
      acceptedTerms: false
    };

    this.sponsorForm = {
      name: '',
      sector: 'Energy & Mining',
      repName: '',
      repContact: '',
      email: '',
      region: 'Greater Accra',
      package: '',
      acceptedTerms: false,
      arenas: {
        'Coding Track': true,
        'Robotics Arena': true,
        'AI & ML Challenge': true,
        'Cyber Security CTF': true,
        'Open Innovation': true
      } as { [key: string]: boolean }
    };
    this.selectedPackages = [];

    localStorage.removeItem('ntic_reg_ui');
  }

  private applyDraftPrefills(contact: string): void {
    const key = contact?.trim().toLowerCase();
    const drafts = JSON.parse(localStorage.getItem('ntic_drafts') || '{}');
    let draft = drafts[key] || drafts[contact];

    if (!draft) {
      this.apiService.loadDraft(key).subscribe({
        next: (res) => { if (res?.data) { this.restoreDraftData(res.data); } },
        error: () => {}
      });
      return;
    }
    this.restoreDraftData(draft);
  }

  private restoreDraftData(draft: any): void {
    this.clearDraftPrefills();

    this.isDraftResumed = true;
    this.activeTab = draft.tab;

    switch (draft.tab) {
      case 'school':
        this.schoolStep = 1;
        this.maxSchoolStepReached = 4;
        this.schoolForm = { ...this.schoolForm, ...draft.data };
        if (draft.data?.selectedFileIds) this.selectedFileIds = { ...draft.data.selectedFileIds };
        if (draft.data?.selectedFileNames) this.selectedFileNames = { ...draft.data.selectedFileNames };
        break;
      case 'instructor':
        this.instructorForm = { ...this.instructorForm, ...draft.data };
        if (draft.data?.selectedFileIds) this.selectedFileIds = { ...draft.data.selectedFileIds };
        if (draft.data?.selectedFileNames) this.selectedFileNames = { ...draft.data.selectedFileNames };
        break;
      case 'student':
        if (draft.data?.competitorMode === 'group') {
          this.teamForm = { ...this.teamForm, ...draft.data };
          this.competitorMode = 'group';
        } else {
          this.studentForm = { ...this.studentForm, ...draft.data };
          this.selectedTrack = draft.data?.selectedTrack || '';
          this.competitorMode = 'individual';
        }
        break;
      case 'judge':
        this.judgeForm = { ...this.judgeForm, ...draft.data };
        if (draft.data?.selectedFileIds) this.selectedFileIds = { ...draft.data.selectedFileIds };
        if (draft.data?.selectedFileNames) this.selectedFileNames = { ...draft.data.selectedFileNames };
        if (this.selectedFileIds['judgeLogo']?.length) this.loadJudgeLogo();
        break;
      case 'sponsor':
        this.sponsorForm = { ...this.sponsorForm, ...draft.data };
        if (draft.data?.selectedFileIds) this.selectedFileIds = { ...draft.data.selectedFileIds };
        if (draft.data?.selectedFileNames) this.selectedFileNames = { ...draft.data.selectedFileNames };
        if (this.selectedFileIds['sponsorLogo']?.length) this.loadSponsorLogo();
        break;
      case 'team':
        this.teamForm = { ...this.teamForm, ...draft.data };
        break;
      case 'open':
        this.openRegForm = { ...this.openRegForm, ...draft.data };
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
    if (!this.validateCurrentTab()) return;

    // Final pre-submit guard against duplicate emails across active/pending accounts
    let targetEmail = '';
    if (this.activeTab === 'school') targetEmail = this.schoolForm.repEmail || this.schoolForm.email;
    else if (this.activeTab === 'instructor') targetEmail = this.instructorForm.email;
    else if (this.activeTab === 'judge') targetEmail = this.judgeForm.email;
    else if (this.activeTab === 'sponsor') targetEmail = this.sponsorForm.email;
    else if (this.activeTab === 'team') targetEmail = this.teamForm.leadEmail;

    if (targetEmail && this.contentService.isEmailTaken(targetEmail, this.editingApprovalId || undefined)) {
      this.isSubmitting = false;
      this.isPreviewModalOpen = false;
      this.showCustomAlert(`The email address "${targetEmail}" is already registered to an active account or pending request. Multiple accounts cannot be created using the same email address.`, 'Email Already Registered', 'warning');
      return;
    }

    this.isSubmitting = true;

    // Capture school logo file ID (not base64 -- too large for storage)
    let logoFileId: string | null = null;
    if (this.activeTab === 'school' && this.schoolLogoUrl) {
      logoFileId = this.selectedFileIds['schoolLogo']?.[0] || null;
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
          code: this.editingApprovalId
            ? (this.contentService.pendingApprovals.find(a => a.id === this.editingApprovalId)?.details?.code || this.generateApplicationCode('school'))
            : this.generateApplicationCode('school'),
          tracks: this.schoolForm.teams.map((t: any) => t.track).filter((value: any, index: number, self: any[]) => self.indexOf(value) === index).join(', ') || 'Coding, Robotics',
          teamsList: this.schoolForm.teams,
          studentCount: this.schoolForm.students.length,
          students: this.schoolForm.students.map((s: any) => ({ id: s.id, name: s.name, track: s.track, class: s.class, dob: s.dob, gender: s.gender, guardianName: s.guardianName, guardianPhone: s.guardianPhone, skills: s.skills })),
          docs: this.selectedFileIds['accredDocs']?.length
            ? this.selectedFileIds['accredDocs'].map((id, i) => `${id}::${this.selectedFileNames['accredDocs']?.[i] || 'document.pdf'}`)
            : []
        };
        if (logoFileId) details.logoFileId = logoFileId;


        // Log student registrations
        if (this.activeTab === 'school' && this.schoolForm.students?.length) {
          const currentAudit2 = [...this.contentService.auditLogs];
          currentAudit2.unshift({
            action: `${this.schoolForm.students.length} students registered under ${this.schoolForm.name}`,
            user: this.schoolForm.repEmail || this.schoolForm.email,
            time: new Date().toISOString(),
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
          coach: 'Instructor assigned by ' + this.teamForm.school,
          code: this.editingApprovalId
            ? (this.contentService.pendingApprovals.find(a => a.id === this.editingApprovalId)?.details?.code || this.generateApplicationCode('team'))
            : this.generateApplicationCode('team')
        };

        const currentTeams = [...this.contentService.teams];
        const memberPhotoIds: string[] = [];
        ['memberLeadPhoto', 'member2Photo', 'member3Photo', 'member4Photo', 'member5Photo'].forEach(k => {
          const id = this.selectedFileIds[k]?.[0];
          if (id) memberPhotoIds.push(id);
        });
        
          // --- INTEGRATION: POSTGRESQL BACKEND ---
          try {
            const names = this.teamForm.leadName.trim().split(' ');
            this.apiService.createStudent({
              first_name: names[0] || 'Unknown',
              last_name: names.slice(1).join(' ') || 'Student',
              email: this.teamForm.leadEmail,
              track: this.teamForm.track,
              consent_granted: true
            }).subscribe({
              next: (res) => console.log('Successfully saved student to PostgreSQL DB:', res),
              error: (err) => console.error('Failed to save to PostgreSQL:', err)
            });
          } catch(e) {}
          // ---------------------------------------

          const regTeam: any = {
          name: this.teamForm.name,
          track: this.teamForm.track || 'Coding',
          lead: this.teamForm.leadName || 'Student Captain',
          members: Math.max(rosterList.length, 3),
          rosterList: rosterList,
          status: 'In Competition',
          schoolName: this.teamForm.school || 'Registered Institution',
          memberPhotos: memberPhotoIds.length ? memberPhotoIds : undefined
        };
        currentTeams.push(regTeam);
        this.contentService.syncNewTeamToBackend(regTeam);
        this.contentService.saveTeams(currentTeams);
      } else if (this.activeTab === 'instructor') {
        approvalType = 'Instructor Access';
        entity = this.instructorForm.name;
        contact = this.instructorForm.email;
        const selectedExpertise = Object.keys(this.instructorForm.expertise)
          .filter(k => this.instructorForm.expertise[k])
          .join(', ');
        details = {
          address: this.instructorForm.address || '',
          region: this.instructorForm.region || '',
          institution: this.instructorForm.isIndependent ? 'Independent Mentor' : (this.instructorForm.institution || 'Independent Mentor'),
          isIndependent: this.instructorForm.isIndependent || false,
          credentials: this.instructorForm.qualification || 'MSc Computer Science',
          specialization: selectedExpertise || 'Coding, AI',
          phone: this.instructorForm.tel || '',
          portfolio: this.instructorForm.portfolio || '',
          experience: 'Mentor with registered history',
          courses: ['LMS Course 101: Python Intro', 'LMS Course 202: Robotics Base'],
          code: this.editingApprovalId
            ? (this.contentService.pendingApprovals.find(a => a.id === this.editingApprovalId)?.details?.code || this.generateApplicationCode('instructor'))
            : this.generateApplicationCode('instructor'),
          docs: this.selectedFileIds['instructorDocs']?.length
            ? this.selectedFileIds['instructorDocs'].map((id, i) => `${id}::${this.selectedFileNames['instructorDocs']?.[i] || 'document.pdf'}`)
            : undefined
        };
      } else if (this.activeTab === 'judge') {
        const ticket = 'NTIC-JDG-' + Math.random().toString(36).substring(2, 6).toUpperCase();
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const judgeLogoId = this.selectedFileIds['judgeLogo']?.[0] || null;
        const newJudge = {
          id: 'USR-' + Date.now(),
          role: 'judge' as const,
          fullName: this.judgeForm.name,
          email: this.judgeForm.email,
          phone: this.judgeForm.tel,
          otp,
          password: otp,
          organization: this.judgeForm.organization,
          region: this.judgeForm.region || '',
          track: this.judgeForm.expertise || 'Coding & Algorithms',
          experience: this.judgeForm.experience || '',
          bio: this.judgeForm.bio || '',
          ticket,
          status: 'Active',
          registeredAt: new Date().toLocaleDateString('en-GB'),
          lastLogin: 'Never'
        };
        if (judgeLogoId) (newJudge as any).logoFileId = judgeLogoId;
        // Save to backend FIRST so the password hash is correct
        this.apiService.createUser({
          email: newJudge.email,
          full_name: newJudge.fullName,
          role: newJudge.role,
          ticket: newJudge.ticket,
          password: newJudge.password || newJudge.otp || '',
          status: 'Active',
          phone: newJudge.phone || ''
        }).subscribe({
          next: () => {
            const currentUsers = [...this.contentService.users];
            currentUsers.unshift(newJudge);
            this.contentService.saveUsers(currentUsers);

            const currentAudit = [...this.contentService.auditLogs];
            currentAudit.unshift({
              action: `Judge token ${ticket} generated for ${newJudge.fullName}`,
              user: 'self-register@ntic.gov.gh',
              time: new Date().toISOString(),
              type: 'ticket'
            });
            this.contentService.saveAuditLogs(currentAudit);

            this.openCredentialsModal(
              'Judge Application Submitted! 🎉',
              'Your judge profile has been created. Copy and save your secure login credentials below:',
              ticket,
              otp,
              'Use these credentials to access the Judge & Grading Portal.',
              '/judge',
              newJudge.email,
              'judge'
            );
          },
          error: () => {
            this.dialogService.toast('Failed to save account. Please try again.', 'error');
          }
        });
      } else if (this.activeTab === 'sponsor') {
        const ticket = 'NTIC-SPO-' + Math.random().toString(36).substring(2, 6).toUpperCase();
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const logoFileId = this.selectedFileIds['sponsorLogo']?.[0] || null;
        const newSponsor = {
          id: 'USR-' + Date.now(),
          role: 'sponsor' as const,
          fullName: this.sponsorForm.name,
          email: this.sponsorForm.email,
          phone: this.sponsorForm.repContact,
          otp,
          password: otp,
          organization: this.sponsorForm.name,
          package: this.sponsorForm.package || '',
          sector: this.sponsorForm.sector || '',
          region: this.sponsorForm.region || '',
          repName: this.sponsorForm.repName || '',
          ticket,
          status: 'Active',
          registeredAt: new Date().toLocaleDateString('en-GB'),
          lastLogin: 'Never'
        };
        if (logoFileId) (newSponsor as any).logoFileId = logoFileId;
        // Save to backend FIRST so the password hash is correct
        this.apiService.createUser({
          email: newSponsor.email,
          full_name: newSponsor.fullName,
          role: newSponsor.role,
          ticket: newSponsor.ticket,
          password: newSponsor.password || newSponsor.otp || '',
          status: 'Active',
          phone: newSponsor.phone || ''
        }).subscribe({
          next: () => {
            const currentUsers = [...this.contentService.users];
            currentUsers.unshift(newSponsor);
            this.contentService.saveUsers(currentUsers);

            const currentAudit = [...this.contentService.auditLogs];
            currentAudit.unshift({
              action: `Sponsor token ${ticket} generated for ${newSponsor.fullName}`,
              user: 'self-register@ntic.gov.gh',
              time: new Date().toISOString(),
              type: 'ticket'
            });
            this.contentService.saveAuditLogs(currentAudit);

            this.openCredentialsModal(
              'Sponsor Profile Registered! 🎉',
              'Your sponsor account has been created. Copy and save your secure credentials below:',
              ticket,
              otp,
              'Use these credentials to access the Sponsor Portal.',
              '/sponsors',
              newSponsor.email,
              'sponsor'
            );
          },
          error: () => {
            this.dialogService.toast('Failed to save account. Please try again.', 'error');
          }
        });
      }
      else if (this.activeTab === 'open' && this.openRegForm.selectedCompetitionId) {
        const selectedComp = this.getSelectedCompetition();
        if (!selectedComp) {
          this.dialogService.toast('Please select a competition cycle.', 'error');
          return;
        }
        const ticket = 'NTIC-OPN-' + Math.random().toString(36).substring(2, 6).toUpperCase();
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const newUser = {
          id: 'USR-' + Date.now(),
          role: 'student' as const,
          fullName: this.openRegForm.fullName,
          email: this.openRegForm.email,
          phone: this.openRegForm.phone || '',
          otp,
          password: otp,
          organization: this.openRegForm.organization || 'Open Registration',
          ageGroup: this.openRegForm.ageGroup,
          experienceLevel: this.openRegForm.experienceLevel,
          competitionId: selectedComp.id,
          competitionTitle: selectedComp.title,
          track: selectedComp.track,
          ticket,
          status: 'Active',
          registeredAt: new Date().toLocaleDateString('en-GB'),
          lastLogin: 'Never'
        };
        if (this.openRegPhotoFileId) (newUser as any).profilePhotoFileId = this.openRegPhotoFileId;
        if (this.openRegDocFileId) (newUser as any).docFileId = this.openRegDocFileId;

        this.apiService.createUser({
          email: newUser.email,
          full_name: newUser.fullName,
          role: 'student',
          ticket: newUser.ticket,
          password: otp,
          phone: newUser.phone || '',
          organization: newUser.organization || '',
          age_group: newUser.ageGroup || '',
          experience_level: newUser.experienceLevel || '',
          competition_id: newUser.competitionId || '',
          photo_file_id: this.openRegPhotoFileId || '',
          doc_file_id: this.openRegDocFileId || '',
          status: 'Active'
        }).subscribe({
          next: () => {
            const currentUsers = [...this.contentService.users];
            currentUsers.unshift(newUser);
            this.contentService.saveUsers(currentUsers);
            const currentAudit = [...this.contentService.auditLogs];
            currentAudit.unshift({
              action: `Open registration ticket ${ticket} for ${newUser.fullName} into ${selectedComp.title}`,
              user: 'self-register@ntic.gov.gh',
              time: new Date().toISOString(),
              type: 'ticket'
            });
            this.contentService.saveAuditLogs(currentAudit);
            this.openCredentialsModal(
              'Open Registration Successful!',
              `You're registered for "${selectedComp.title}". Copy your credentials below:`,
              ticket,
              otp,
              'Use these credentials to log in and start competing.',
              '/dashboard',
              newUser.email,
              'student'
            );
          },
          error: () => {
            this.dialogService.toast('Failed to save account. Please try again.', 'error');
          }
        });
      }

      if (approvalType) {
        const currentApprovals = [...this.contentService.pendingApprovals];
        if (this.editingApprovalId) {
          const idx = currentApprovals.findIndex(a => a.id === this.editingApprovalId);
          if (idx > -1) {
            currentApprovals[idx] = {
              ...currentApprovals[idx],
              type: approvalType,
              entity,
              contact,
              submitted: 'Updated ' + new Date().toLocaleString('en-GB'),
              details
            };
          } else {
            currentApprovals.unshift({
              id: 'REQ-' + Date.now(),
              type: approvalType,
              entity,
              contact,
              submitted: 'Just now',
              details
            });
          }
        } else {
          currentApprovals.unshift({
            id: 'REQ-' + Date.now(),
            type: approvalType,
            entity,
            contact,
            submitted: 'Just now',
            details
          });
        }
        this.contentService.saveApprovals(currentApprovals);

        const emailTo = contact || '';
        const emailName = entity || '';
        let phone = '';
        if (this.activeTab === 'school') phone = this.schoolForm.repTel || this.schoolForm.tel || '';
        else if (this.activeTab === 'team') phone = '';
        else if (this.activeTab === 'instructor') phone = this.instructorForm.tel || '';
        if (emailTo) {
          this.emailService.sendPendingConfirmation(emailTo, emailName, emailName, approvalType);
        }

        const currentAudit = [...this.contentService.auditLogs];
        currentAudit.unshift({
          action: this.editingApprovalId ? `Application updated (${approvalType}): ${entity}` : `New ${approvalType} requested: ${entity}`,
          user: contact,
          time: new Date().toISOString(),
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

      this.justUpdatedApplication = !!this.editingApprovalId;
      this.editingApprovalId = null;
      this.lastApplicationCode = details.code || null;
      this.copiedApplicationCode = false;
      this.isSuccessModalOpen = true;
      this.clearDraftPrefills();
    } catch (err) {
      console.error('[Registration] Submission error:', err);
      this.isSubmitting = false;
      this.isPreviewModalOpen = false;
      this.dialogService.toast('Submission failed. Please try again. Error: ' + (err as any)?.message, 'error');
    }
    }, 1500);
  }

  closeSuccessModal(): void {
    this.isSuccessModalOpen = false;
    this.justUpdatedApplication = false;
    this.lastApplicationCode = null;
    this.copiedApplicationCode = false;
    this.regState = 'gateway';
    this.clearRegState();
    this.judgeForm = {
      name: '',
      tel: '',
      email: '',
      organization: '',
      region: 'Greater Accra',
      expertise: '',
      experience: '',
      bio: '',
      ticketCode: '',
      otp: '',
      acceptedTerms: false
    };
    this.clearDraftPrefills();
  }
}
