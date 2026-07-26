import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ContentService, User } from '../../services/content.service';
import { ThemeService } from '../../services/theme.service';

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
  isSubmitting = false;
  isSaved = false;
  isDraftResumed = false;

  fieldValidation: Record<string, { status: 'idle' | 'checking' | 'valid' | 'taken' | 'invalid'; message: string }> = {};
  private validationTimers: Record<string, any> = {};

  constructor(
    private router: Router,
    public contentService: ContentService,
    public themeService: ThemeService
  ) {}

  ngOnInit(): void {
    const userEmail = localStorage.getItem('activeUserEmail');
    const userTicket = localStorage.getItem('activeUserTicket');

    if (userEmail || userTicket) {
      this.currentUser = this.contentService.users.find(u => 
        (userEmail && u.email?.trim().toLowerCase() === userEmail.trim().toLowerCase()) ||
        (userEmail && u.ticket?.trim().toLowerCase() === userEmail.trim().toLowerCase()) ||
        (userTicket && u.ticket?.trim().toLowerCase() === userTicket.trim().toLowerCase())
      ) || null;
    }

    if (!this.currentUser) {
      this.router.navigate(['/']);
      return;
    }

    const isJudge = this.currentUser.role === 'judge';
    const isSponsor = this.currentUser.role === 'sponsor';

    if (!isJudge && !isSponsor) {
      this.router.navigate(['/']);
      return;
    }

    const userTier = this.currentUser.tier || (this.currentUser as any).package || '';
    let resolvedTier = 'Gold Partner (GH₵ 20,000 - 100,000)';
    if (userTier.includes('Platinum')) resolvedTier = 'Platinum Partner (GH₵ 100,000+)';
    else if (userTier.includes('Gold')) resolvedTier = 'Gold Partner (GH₵ 20,000 - 100,000)';
    else if (userTier.includes('Silver')) resolvedTier = 'Silver Partner (GH₵ 5,000 - 20,000)';
    else if (userTier.includes('Bronze')) resolvedTier = 'Bronze Partner (GH₵ 1,000 - 5,000)';

    const userSector = (this.currentUser as any).sector || '';
    let resolvedSector = 'Technology';
    if (userSector.includes('Telecommunication') || userSector.includes('Telecom')) resolvedSector = 'Telecommunications';
    else if (userSector.includes('Energy') || userSector.includes('Mining')) resolvedSector = 'Energy & Mining';
    else if (userSector.includes('Banking') || userSector.includes('Finance')) resolvedSector = 'Banking & Finance';
    else if (userSector.includes('Tech')) resolvedSector = 'Technology';
    else if (userSector.includes('Manufacturing')) resolvedSector = 'Manufacturing';
    else if (userSector.includes('Education')) resolvedSector = 'Education';
    else if (userSector.includes('Health')) resolvedSector = 'Healthcare';
    else if (userSector.includes('NGO')) resolvedSector = 'NGO / Development';

    const userTrack = this.currentUser.track || 'General STEM';
    let resolvedExpertise = 'General STEM';
    if (userTrack.includes('Coding')) resolvedExpertise = 'Coding & Software Engineering';
    else if (userTrack.includes('Robotics')) resolvedExpertise = 'Robotics & Embedded Systems';
    else if (userTrack.includes('AI')) resolvedExpertise = 'AI & Data Science';
    else if (userTrack.includes('Cyber')) resolvedExpertise = 'Cybersecurity & Defense';
    else if (userTrack.includes('Innovation')) resolvedExpertise = 'Innovation & Product Design';

    this.profileForm = {
      fullName: this.currentUser.fullName || '',
      organization: (this.currentUser.organization && this.currentUser.organization !== '_pending_profile') ? this.currentUser.organization : (this.currentUser.fullName || ''),
      email: this.currentUser.email,
      phone: this.currentUser.phone || '',
      // Judge-specific
      expertise: resolvedExpertise,
      experience: '4-7',
      bio: '',
      // Sponsor-specific
      sector: resolvedSector,
      repName: this.currentUser.fullName || '',
      amount: (this.currentUser as any).total || '50,000',
      tier: resolvedTier,
      paymentMethod: 'Bank Transfer',
      bankName: 'Ecobank Ghana',
      momoNetwork: 'MTN Mobile Money',
      billingDept: '',
      billingRef: (this.currentUser as any).billingRef || '',
      accountHolderName: this.currentUser.fullName || '',
      cardName: this.currentUser.fullName || '',
      cardNumber: '',
      cardExpiry: '',
      cardCvv: '',
      chequeNo: '',
      issuingBank: 'Stanbic Bank Ghana',
      billingEmail: this.currentUser.email || '',
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
    const draft = drafts[this.currentUser.email];
    if (draft) {
      this.isDraftResumed = true;
      this.profileForm = { ...this.profileForm, ...draft.data };
    }

    // Post-draft normalization so HTML select elements always match exactly
    const rawTier = this.profileForm.tier || this.currentUser.tier || (this.currentUser as any).package || '';
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
        this.fieldValidation[fieldName] = { status: 'valid', message: 'Email available' };
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

    setTimeout(() => {
      if (this.currentUser) {
        const updatedUsers = this.contentService.users.map(u => {
          if (u.id === this.currentUser!.id) {
            return {
              ...u,
              fullName: this.profileForm.fullName.trim() || u.fullName,
              organization: this.profileForm.organization.trim() || u.organization,
              phone: this.profileForm.phone?.trim() || u.phone,
              track: this.profileForm.expertise || u.track || '',
              tier: this.profileForm.tier || u.tier || ''
            };
          }
          return u;
        });
        this.contentService.saveUsers(updatedUsers);

        // Create pending approval for the completed profile
        if (this.isJudge) {
          this.contentService.pendingApprovals = [...this.contentService.pendingApprovals, {
            id: 'APR-' + Date.now(),
            type: 'Instructor Access' as const,
            entity: this.profileForm.organization,
            contact: this.currentUser.email,
            submitted: new Date().toISOString(),
            details: {
              name: this.profileForm.fullName,
              email: this.currentUser.email,
              phone: this.profileForm.phone,
              region: '',
              category: 'Judge',
              expertise: this.profileForm.expertise,
              experience: this.profileForm.experience,
              bio: this.profileForm.bio
            }
          }];
          this.contentService.saveApprovals(this.contentService.pendingApprovals);
        } else if (this.isSponsor) {
          this.contentService.pendingApprovals = [...this.contentService.pendingApprovals, {
            id: 'APR-' + Date.now(),
            type: 'Team Addition' as const,
            entity: this.profileForm.organization,
            contact: this.currentUser.email,
            submitted: new Date().toISOString(),
            details: {
              name: this.profileForm.fullName,
              email: this.currentUser.email,
              phone: this.profileForm.phone,
              region: '',
              category: 'Sponsor',
              sector: this.profileForm.sector,
              repName: this.profileForm.repName,
              amount: this.profileForm.amount,
              tier: this.profileForm.tier
            }
          }];
          this.contentService.saveApprovals(this.contentService.pendingApprovals);
        }

        // Delete draft
        const drafts = JSON.parse(localStorage.getItem('ntic_drafts') || '{}');
        delete drafts[this.currentUser.email];
        localStorage.setItem('ntic_drafts', JSON.stringify(drafts));
      }

      this.isSubmitting = false;
      const targetRoute = this.isJudge ? '/judge' : '/sponsors';
      this.router.navigate([targetRoute]);
    }, 1500);
  }
}
