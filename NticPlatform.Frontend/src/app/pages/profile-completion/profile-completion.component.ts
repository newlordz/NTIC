import { getAuthValue } from '../../services/session.util';
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ContentService, User } from '../../services/content.service';
import { ThemeService } from '../../services/theme.service';
import { CurrentUserService } from '../../services/current-user.service';
import { ApiService } from '../../services/api.service';
import { FileStorageService } from '../../services/file-storage.service';

@Component({
  selector: 'app-profile-completion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile-completion.component.html',
  styleUrls: ['./profile-completion.component.scss']
})
export class ProfileCompletionComponent implements OnInit {
  currentUser: User | null = null;
  profileForm: any = {};
  profilePhotoFileId: string | null = null;
  profilePhotoPreviewUrl: string | null = null;
  isSubmitting = false;
  isSaved = false;
  isDraftResumed = false;
  saveError = '';

  fieldValidation: Record<string, { status: 'idle' | 'checking' | 'valid' | 'taken' | 'invalid'; message: string }> = {};
  private validationTimers: Record<string, any> = {};

  constructor(
    private router: Router,
    public contentService: ContentService,
    public themeService: ThemeService,
    private apiService: ApiService,
    private currentUserService: CurrentUserService,
    private fileStorage: FileStorageService
  ) {}

  ngOnInit(): void {
    if (!getAuthValue('activeRoleId')) {
      this.router.navigate(['/']);
      return;
    }
    // Prefill from GET /api/users/me.
    //
    // This used to search `contentService.users` and, on the guaranteed miss for
    // any non-admin, substitute a fabricated user: fullName 'Super Admin', phone
    // '+233 24 000 0000', organization 'NTIC Ghana Administration'. A judge or
    // sponsor opening their own profile page saw those values pre-filled in the
    // form, and saving would have written them to their real account.
    this.currentUserService.ensureLoaded().subscribe(me => {
      if (me) {
        if (me.photo_file_id) {
          this.profilePhotoFileId = me.photo_file_id;
          this.fileStorage.getUrl(me.photo_file_id).then(url => {
            this.profilePhotoPreviewUrl = url;
          });
        }
        this.applyProfile({
          id: me.id,
          fullName: me.full_name,
          email: me.email,
          phone: me.phone || '',
          role: me.role,
          organization: me.organization || '',
          tier: me.tier || '',
          sector: me.sector || '',
          track: me.track || '',
          bio: me.bio || '',
          expertise: me.expertise || '',
          repName: me.rep_name || '',
          experience: me.experience_level || '',
          photo_file_id: me.photo_file_id || '',
        } as any);
      } else {
        // Offline: fall back to the little we know for certain, leaving the rest
        // blank for the user to fill in.
        this.applyProfile({
          id: '',
          fullName: getAuthValue('activeUserName') || '',
          email: getAuthValue('activeUserEmail') || '',
          phone: '',
          role: getAuthValue('activeRoleId') || '',
          organization: '',
        } as any);
      }
    });
  }

  private applyProfile(user: any): void {
    this.currentUser = user;

    const userTier = user.tier || (user as any).package || '';
    let resolvedTier = 'Gold Partner (GH₵ 20,000 - 100,000)';
    if (userTier.includes('Platinum')) resolvedTier = 'Platinum Partner (GH₵ 100,000+)';
    else if (userTier.includes('Gold')) resolvedTier = 'Gold Partner (GH₵ 20,000 - 100,000)';
    else if (userTier.includes('Bronze')) resolvedTier = 'Bronze Partner (GH₵ 1,000 - 5,000)';

    const userSector = (user as any).sector || '';
    let resolvedSector = 'Technology';
    if (userSector.includes('Telecommunication') || userSector.includes('Telecom')) resolvedSector = 'Telecommunications';
    else if (userSector.includes('Energy') || userSector.includes('Mining')) resolvedSector = 'Energy & Mining';
    else if (userSector.includes('Banking') || userSector.includes('Finance')) resolvedSector = 'Banking & Finance';
    else if (userSector.includes('Tech')) resolvedSector = 'Technology';
    else if (userSector.includes('Manufacturing')) resolvedSector = 'Manufacturing';
    else if (userSector.includes('Education')) resolvedSector = 'Education';
    else if (userSector.includes('Health')) resolvedSector = 'Healthcare';
    else if (userSector.includes('NGO')) resolvedSector = 'NGO / Development';

    const userTrack = user.track || 'General NTI';
    let resolvedExpertise = 'General NTI';
    if (userTrack.includes('Coding')) resolvedExpertise = 'Coding & Software Engineering';
    else if (userTrack.includes('Robotics')) resolvedExpertise = 'Robotics & Embedded Systems';
    else if (userTrack.includes('AI')) resolvedExpertise = 'AI & Data Science';
    else if (userTrack.includes('Cyber')) resolvedExpertise = 'Networking & Cybersecurity';
    else if (userTrack.includes('Innovation')) resolvedExpertise = 'Innovation & Product Design';

    this.profileForm = {
      fullName: user.fullName || '',
      organization: (user.organization && user.organization !== '_pending_profile') ? user.organization : (user.fullName || ''),
      email: user.email,
      phone: user.phone || '',
      // Judge-specific
      expertise: resolvedExpertise,
      experience: '4-7',
      bio: '',
      // Sponsor-specific
      sector: resolvedSector,
      repName: user.fullName || '',
      tier: resolvedTier,
      billingDept: '',
      billingRef: (user as any).billingRef || '',
      billingEmail: user.email || '',
      // NOTE: cardName / cardNumber / cardExpiry / cardCvv, and the
      // paymentMethod / bankName / momoNetwork / accountHolderName / chequeNo /
      // issuingBank / amount fields, used to live here.
      //
      // They were removed deliberately. `saveDraft()` spreads this whole object
      // into localStorage['ntic_drafts'], so a full card number and CVV were
      // being written to disk in cleartext, readable by any XSS and never
      // cleared on logout. Storing a CVV is prohibited outright, and none of it
      // was ever sent anywhere -- no processor, no API -- so the form carried
      // real cardholder-data risk for zero function.
      //
      // If sponsorship payments are needed later, they must go through a
      // payment provider's hosted fields/redirect so card data never touches
      // this app, and the amount belongs on a sponsorship record, not on the
      // user row.
      arenas: {
        'Coding Arena': true,
        'Robotics Arena': true,
        'AI Lab': true,
        'Innovation Hub': true,
        'Cyber Range': true,
        'Open Innovation': true
      } as { [key: string]: boolean }
    };

    // Try to restore draft
    const drafts = JSON.parse(localStorage.getItem('ntic_drafts') || '{}');
    const draft = user.email ? drafts[user.email] : null;
    if (draft) {
      this.isDraftResumed = true;
      this.profileForm = { ...this.profileForm, ...draft.data };
    }

    const rawTier = this.profileForm.tier || user.tier || (user as any).package || '';
    if (rawTier.includes('Platinum')) this.profileForm.tier = 'Platinum Partner';
    else if (rawTier.includes('Gold')) this.profileForm.tier = 'Gold Partner';
    else if (rawTier.includes('Silver')) this.profileForm.tier = 'Silver Partner';
    else if (rawTier.includes('Bronze')) this.profileForm.tier = 'Bronze Partner';
    else this.profileForm.tier = 'Gold Partner';

    const rawSector = this.profileForm.sector || (this.currentUser as any).sector || '';
    if (rawSector.includes('Telecommunication') || rawSector.includes('Telecom')) this.profileForm.sector = 'Telecommunications';
    else if (rawSector.includes('Energy') || rawSector.includes('Mining')) this.profileForm.sector = 'Energy & Mining';
    else if (rawSector.includes('Banking') || rawSector.includes('Finance')) this.profileForm.sector = 'Banking & Finance';
    else if (rawSector.includes('Tech')) this.profileForm.sector = 'Technology';
    else if (rawSector.includes('Manufacturing')) this.profileForm.sector = 'Manufacturing';
    else if (rawSector.includes('Education')) this.profileForm.sector = 'Education';
    else if (rawSector.includes('Health')) this.profileForm.sector = 'Healthcare';
    else if (rawSector.includes('NGO')) this.profileForm.sector = 'NGO / Development';
    else this.profileForm.sector = 'Technology';
  }

  goBack(): void {
    if (this.isSponsor) {
      this.router.navigate(['/sponsors']);
    } else if (this.isJudge) {
      this.router.navigate(['/judge']);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }

  get isJudge(): boolean {
    return this.currentUser?.role === 'judge';
  }

  get isSponsor(): boolean {
    return this.currentUser?.role === 'sponsor';
  }

  /** Heading text. The template hardcoded `isJudge ? 'Judge' : 'Sponsor'`, so a
   *  student or instructor editing their own profile was told it was a "Sponsor
   *  Profile". */
  get profileHeading(): string {
    const labels: Record<string, string> = {
      judge: 'Judge', sponsor: 'Sponsor', student: 'Student',
      instructor: 'Instructor', school_admin: 'School Admin',
    };
    return labels[this.currentUser?.role || ''] || 'Account';
  }

  get profileIcon(): string {
    const icons: Record<string, string> = {
      judge: 'gavel', sponsor: 'handshake', student: 'school',
      instructor: 'co_present', school_admin: 'domain',
    };
    return icons[this.currentUser?.role || ''] || 'person';
  }

  /**
   * Where to go after a successful save.
   *
   * This was `isJudge ? '/judge' : '/sponsors'`, so a student or instructor was
   * sent to /sponsors -- a route their role guard denies, bouncing them to
   * /dashboard with no explanation of whether the save worked.
   */
  private get postSaveRoute(): string {
    switch (this.currentUser?.role) {
      case 'judge': return '/judge';
      case 'sponsor': return '/sponsors';
      case 'student': return '/lms';
      case 'instructor': return '/lms-manager';
      default: return '/dashboard';
    }
  }

  validateEmailLive(fieldName: string, value: string): void {
    if (this.validationTimers[fieldName]) clearTimeout(this.validationTimers[fieldName]);
    if (!value?.trim()) {
      this.fieldValidation[fieldName] = { status: 'idle', message: '' };
      return;
    }
    this.fieldValidation[fieldName] = { status: 'checking', message: 'Checking...' };
    this.validationTimers[fieldName] = setTimeout(() => {
      if (!this.contentService.isValidEmail(value)) {
        this.fieldValidation[fieldName] = { status: 'invalid', message: 'Invalid email format' };
      } else if (this.contentService.isEmailTaken(value, this.currentUser?.id)) {
        this.fieldValidation[fieldName] = { status: 'taken', message: 'This email is already registered' };
      } else {
        this.fieldValidation[fieldName] = { status: 'valid', message: '' };
      }
    }, 400);
  }

  saveDraft(): void {
    if (!this.currentUser) return;
    const drafts = JSON.parse(localStorage.getItem('ntic_drafts') || '{}');
    drafts[this.currentUser.email] = {
      tab: this.currentUser.role,
      data: { ...this.profileForm },
      savedAt: new Date().toISOString()
    };
    localStorage.setItem('ntic_drafts', JSON.stringify(drafts));
    this.isSaved = true;
  }

  submitProfile(): void {
    if (this.isSubmitting) return;

    if (!this.profileForm.organization?.trim()) {
      this.profileForm.organization = this.currentUser?.fullName || 'Corporate Sponsor';
    }
    if (this.isSponsor) {
      if (!this.profileForm.repName?.trim()) {
        this.profileForm.repName = this.currentUser?.fullName || 'CSR Representative';
      }
      if (!this.profileForm.sector) {
        this.profileForm.sector = 'Technology';
      }
    }
    if (this.isJudge) {
      if (!this.profileForm.expertise) {
        this.profileForm.expertise = 'General';
      }
      if (!this.profileForm.experience) {
        this.profileForm.experience = '4-7';
      }
    }

    this.isSubmitting = true;
    this.saveError = '';

    // Previously this was a setTimeout(1500) that wrote to localStorage and
    // navigated away. Nothing ever reached the server, so a judge or sponsor
    // completed their profile, saw a success screen, and lost everything the
    // next time they signed in on another device. There was also no endpoint to
    // call -- PATCH /api/users/me was added for this.
    this.apiService.updateMyProfile({
      full_name: this.profileForm.fullName?.trim() || undefined,
      phone: this.profileForm.phone?.trim() ?? undefined,
      organization: this.profileForm.organization?.trim() || undefined,
      bio: this.profileForm.bio?.trim() ?? undefined,
      expertise: this.isJudge ? (this.profileForm.expertise || undefined) : undefined,
      experience_level: this.isJudge ? (this.profileForm.experience || undefined) : undefined,
      sector: this.isSponsor ? (this.profileForm.sector || undefined) : undefined,
      rep_name: this.isSponsor ? (this.profileForm.repName?.trim() || undefined) : undefined,
      tier: this.isSponsor ? (this.profileForm.tier || undefined) : undefined,
      photo_file_id: this.profilePhotoFileId || undefined,
    }).subscribe({
      next: () => {
        // PATCH /api/users/me is the save. There used to be a
        // contentService.saveUsers() call here too, which pushed the whole user
        // list through POST /api/bulk-sync -- an admin-only endpoint. For the
        // judges and sponsors who actually use this page it always 403'd, so it
        // achieved nothing except (now that failures are surfaced) an error toast
        // immediately after a successful save. Removed.
        //
        // Re-read the profile instead so the sidebar, greeting and avatar pick up
        // the new name straight away.
        this.currentUserService.refresh().subscribe();
        this.queueApprovalForReview();
        this.clearDraft();
        this.isSubmitting = false;
        this.router.navigate([this.postSaveRoute]);
      },
      error: (err: any) => {
        this.isSubmitting = false;
        // Say what went wrong and do NOT navigate away or clear the draft --
        // the previous version could not fail, so it always claimed success.
        this.saveError = err?.status === 409
          ? (err?.error?.detail || 'That phone number is already registered to another account.')
          : err?.status === 422
            ? (err?.error?.detail || 'Please check the details you entered.')
            : err?.status === 401
              ? 'Your session expired. Please sign in again.'
              : 'Could not save your profile. Nothing was changed -- please try again.';
      },
    });
  }

  /**
   * Files the completed profile for admin review.
   *
   * Previously this pushed a row into `contentService.pendingApprovals` and called
   * `saveApprovals()`, which syncs via POST /api/bulk-sync -- an admin-only
   * endpoint. A judge or sponsor completing onboarding therefore 403'd silently:
   * the request never reached the admin queue, so nobody knew they had applied.
   *
   * POST /api/approvals/mine builds the record server-side from the verified
   * session, so the applicant's identity and role cannot be forged, and
   * re-submitting updates the existing pending row instead of stacking
   * duplicates.
   */
  private queueApprovalForReview(): void {
    const role = this.currentUser?.role;
    if (role !== 'judge' && role !== 'sponsor' && role !== 'instructor') return;

    this.apiService.submitMyOnboarding().subscribe({
      next: () => { /* queued for review */ },
      error: (err: any) => {
        // The profile itself saved fine; only the review request failed. Say so
        // rather than implying the whole save was lost.
        this.saveError = err?.status === 400
          ? ''
          : 'Your profile was saved, but we could not notify an administrator for review. Please contact support if your account is not activated.';
      },
    });
  }

  private clearDraft(): void {
    if (!this.currentUser) return;
    const drafts = JSON.parse(localStorage.getItem('ntic_drafts') || '{}');
    delete drafts[this.currentUser.email];
    localStorage.setItem('ntic_drafts', JSON.stringify(drafts));
  }

  async onPhotoSelected(event: any): Promise<void> {
    const files: FileList = event.target.files;
    if (!files?.length) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      this.saveError = 'Please select an image file.';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.saveError = 'Image must be smaller than 5MB.';
      return;
    }
    this.saveError = '';
    const id = this.fileStorage.generateId();
    await this.fileStorage.store(id, file);
    this.profilePhotoFileId = id;
    this.profilePhotoPreviewUrl = await this.fileStorage.getUrl(id);
  }

  removePhoto(): void {
    if (this.profilePhotoFileId) {
      this.fileStorage.remove(this.profilePhotoFileId).catch(() => {});
      this.profilePhotoFileId = null;
      this.profilePhotoPreviewUrl = null;
    }
  }
}
