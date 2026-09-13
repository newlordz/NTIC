import { getAuthValue } from '../../services/session.util';
import { Component, ChangeDetectionStrategy, OnInit , ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ContentService, SponsorPayment, User } from '../../services/content.service';
import { DialogService } from '../../services/dialog.service';
import { ApiService, Sponsorship, SponsorPayment as ApiSponsorPayment, SponsorshipSummary } from '../../services/api.service';
import { CurrentUserService } from '../../services/current-user.service';

@Component({
  selector: 'app-sponsors',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './sponsors.component.html',
  styleUrl: './sponsors.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SponsorsComponent implements OnInit {
  sponsorAvatar$ = this.currentUser.avatar$();

  constructor(
    public contentService: ContentService,
    public dialogService: DialogService,
    public apiService: ApiService,
    public currentUser: CurrentUserService,
  private cdr: ChangeDetectorRef) {}
  isEditProfileModalOpen = false;
  profileEditForm = {
    organization: '',
    fullName: '',
    phone: '',
    tier: '',
    track: ''
  };
  isSavingProfile = false;
  profileSuccessMessage = '';

  isPaymentModalOpen = false;
  selectedPaymentMethod: 'Bank Transfer' | 'Mobile Money' | 'Corporate Cheque' = 'Bank Transfer';

  paymentForm: { amount: string; refNo: string; notes: string } = {
    amount: '',
    refNo: '',
    notes: ''
  };

  isSubmittingPayment = false;
  paymentSuccessMessage = '';

  // Payment proof file upload state
  proofFile: File | null = null;
  proofFileName = '';
  proofFileUrl = '';
  isUploadingProof = false;

  // Ecosystem summary state
  ecosystemSummary: SponsorshipSummary | null = null;
  isLoadingEcosystemSummary = false;

  // Admin verification queue state
  pendingPayments: ApiSponsorPayment[] = [];
  isLoadingPendingPayments = false;
  isVerifyingPayment: { [id: string]: boolean } = {};

  get isAdmin(): boolean {
    const role = (getAuthValue('activeRoleId') || '').toLowerCase();
    return role === 'admin' || role === 'super_admin';
  }

  ngOnInit(): void {
    this.currentUser.ensureLoaded().subscribe(() => {
      this.loadSponsorData();
      this.loadEcosystemSummary();
      if (this.isAdmin) {
        this.loadPendingPayments();
      }
    });
    this.loadEcosystemSummary();
    if (this.isAdmin) {
      this.loadPendingPayments();
    }
    this.cdr.markForCheck();
  }

  openEditProfileModal(): void {
    const sponsor = this.loggedInSponsor;
    if (!sponsor) return;

    this.profileEditForm = {
      organization: (sponsor.organization && sponsor.organization !== '_pending_profile') ? sponsor.organization : '',
      fullName: sponsor.fullName || '',
      phone: sponsor.phone || '',
      tier: sponsor.tier || 'Gold Partner (GH₵ 20k-100k)',
      track: sponsor.track || 'All Tracks'
    };
    this.profileSuccessMessage = '';
    this.isEditProfileModalOpen = true;
  }

  closeEditProfileModal(): void {
    this.isEditProfileModalOpen = false;
  }

  saveProfile(): void {
    const sponsor = this.loggedInSponsor;
    if (!sponsor) return;

    const trimmedPhone = this.profileEditForm.phone.trim();
    if (!trimmedPhone) {
      this.dialogService.toast('Please enter a valid contact phone number.', 'warning');
      return;
    }

    this.isSavingProfile = true;

    this.apiService.updateMyProfile({
      phone: trimmedPhone
    }).subscribe({
      next: () => {
        this.currentUser.refresh().subscribe(() => {
          this.isSavingProfile = false;
          this.profileSuccessMessage = 'Contact phone number updated successfully!';
          setTimeout(() => {
            this.closeEditProfileModal();
          }, 1000);
        });
      },
      error: () => {
        this.isSavingProfile = false;
        this.dialogService.toast('Failed to save contact phone number. Please try again.', 'error');
      }
    });
  }

  get loggedInSponsor(): any {
    const activeRole = getAuthValue('activeRoleId');
    if (activeRole !== 'sponsor') return null;

    const profile = this.currentUser.profile();
    if (profile) {
      return {
        id: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        role: profile.role,
        ticket: profile.ticket,
        status: profile.status,
        organization: profile.organization,
        phone: profile.phone || '',
        tier: profile.tier || 'Gold Partner (GH₵ 20k-100k)',
        track: profile.track || 'All Tracks',
        registeredAt: (profile as any).created_at || 'Active',
        photo_file_id: profile.photo_file_id || ''
      };
    }

    const email = getAuthValue('activeUserEmail') || '';
    const ticket = getAuthValue('activeUserTicket') || '';
    const name = getAuthValue('activeUserName') || '';

    if (email || ticket) {
      return {
        id: ticket || email,
        email: email,
        fullName: name || 'Corporate Sponsor',
        role: 'sponsor',
        ticket: ticket,
        status: 'Active',
        organization: name || '',
        phone: '',
        tier: 'Gold Partner (GH₵ 20k-100k)',
        track: 'All Tracks',
        registeredAt: 'Active'
      };
    }

    return null;
  }

  get isSponsorLoggedIn(): boolean {
    const activeRole = getAuthValue('activeRoleId');
    return activeRole === 'sponsor' || !!this.loggedInSponsor;
  }

  getSponsorName(s: any): string {
    if (!s) return 'Sponsor Partner';
    if (s.organization && s.organization !== '_pending_profile') return s.organization;
    return s.fullName || 'Corporate Partner';
  }

  getSponsorTier(s: any): string {
    if (!s) return 'Partner';
    return s.tier || 'Partner';
  }

  getSponsorTotal(s: any): string {
    if (!s) return 'GH₵ 0';
    if (s.total) return s.total;
    if (s.payments && s.payments.length > 0) {
      const sum = s.payments.reduce((acc: number, p: SponsorPayment) => {
        const val = parseInt(p.amount.replace(/[^0-9]/g, ''), 10) || 0;
        return acc + val;
      }, 0);
      return `GH₵ ${sum.toLocaleString()}`;
    }
    return 'GH₵ 0';
  }

  copyText(text: string, label: string = 'Copied'): void {
    if (!text) return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.dialogService.toast(`${label} copied to clipboard`, 'success');
      }).catch(() => {
        this.fallbackCopyText(text, label);
      });
    } else {
      this.fallbackCopyText(text, label);
    }
  }

  private fallbackCopyText(text: string, label: string = 'Copied'): void {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      this.dialogService.toast(`${label} copied to clipboard`, 'success');
    } catch {
      this.dialogService.toast(`Failed to copy ${label}`, 'error');
    }
    document.body.removeChild(textArea);
  }

  openPaymentModal(): void {
    this.isPaymentModalOpen = true;
    this.paymentSuccessMessage = '';
    this.paymentError = '';
    this.proofFile = null;
    this.proofFileName = '';
    this.proofFileUrl = '';
    this.isUploadingProof = false;
    this.selectedPaymentMethod = 'Bank Transfer';
    this.paymentForm = {
      amount: '',
      refNo: '',
      notes: ''
    };
  }

  closePaymentModal(): void {
    this.isPaymentModalOpen = false;
  }

  onProofFileSelected(event: any): void {
    const file = event?.target?.files?.[0];
    if (!file) return;
    this.proofFile = file;
    this.proofFileName = file.name;
    this.isUploadingProof = true;
    this.apiService.uploadFileBlob(file).subscribe({
      next: res => {
        this.isUploadingProof = false;
        this.proofFileUrl = res.url || res.file_url || (res.file_id ? `/api/files/${res.file_id}` : '');
        this.dialogService.toast('Payment proof uploaded successfully.', 'success');
        this.cdr.markForCheck();
      },
      error: () => {
        this.isUploadingProof = false;
        this.dialogService.toast('Could not upload file. Please try again.', 'error');
        this.cdr.markForCheck();
      }
    });
  }

  removeProofFile(): void {
    this.proofFile = null;
    this.proofFileName = '';
    this.proofFileUrl = '';
  }

  /**
   * Records a payment reference against the sponsor's commitment.
   */
  submitPayment(): void {
    const amount = (this.paymentForm.amount || '').trim();
    const reference = (this.paymentForm.refNo || '').trim();
    if (!amount || !reference) {
      this.dialogService.toast('Please enter both the payment amount and reference number.', 'warning');
      return;
    }
    // Strip thousands separators but keep the decimal point -- the server parses a
    // decimal, and silently dropping the fractional part would misstate the sum.
    const normalised = amount.replace(/[^0-9.]/g, '');
    if (!normalised || Number(normalised) <= 0) {
      this.dialogService.toast('Enter a payment amount greater than zero.', 'warning');
      return;
    }
    if (!this.activeSponsorshipId) {
      this.dialogService.toast(
        'Record your sponsorship commitment before adding a payment.', 'warning');
      return;
    }

    this.isSubmittingPayment = true;
    this.paymentSuccessMessage = '';
    this.paymentError = '';

    const methodSlug = this.selectedPaymentMethod === 'Mobile Money' ? 'mobile_money'
      : this.selectedPaymentMethod === 'Corporate Cheque' ? 'cheque'
      : 'bank_transfer';

    this.apiService.recordSponsorPayment(this.activeSponsorshipId, {
      amount: normalised,
      method: methodSlug,
      reference,
      notes: (this.paymentForm.notes || '').trim(),
      proof_file_url: this.proofFileUrl || undefined,
    }).subscribe({
      next: () => {
        this.isSubmittingPayment = false;
        this.paymentSuccessMessage =
          'Payment reference recorded. Our team will verify it against the bank statement and confirm.';
        this.loadSponsorData();
        if (this.isAdmin) {
          this.loadPendingPayments();
        }
        this.loadEcosystemSummary();
        setTimeout(() => this.closePaymentModal(), 1400);
      },
      error: (err: any) => {
        this.isSubmittingPayment = false;
        this.paymentError = err?.status === 409
          ? 'A payment with that reference is already recorded.'
          : err?.status === 403
            ? 'You can only record payments against your own sponsorship.'
            : err?.status === 422
              ? (err?.error?.detail || 'Check the amount and reference and try again.')
              : 'Could not record the payment. Nothing was saved -- please try again.';
      },
    });
  }

  // ── Server-backed sponsorship state ───────────────────────────────────
  mySponsorships: Sponsorship[] = [];
  myPayments: ApiSponsorPayment[] = [];
  paymentError = '';
  isLoadingSponsorship = false;
  pledgeAmountInput = '';
  isSavingPledge = false;

  /** The commitment payments are recorded against. */
  get activeSponsorshipId(): string {
    const active = this.mySponsorships.find(s => s.status === 'active')
      || this.mySponsorships[0];
    return active ? active.id : '';
  }

  get totalPledged(): string {
    return this.mySponsorships.reduce((sum, s) => sum + (Number(s.amount_pledged) || 0), 0)
      .toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  /** Verified money only. A recorded reference is a claim, not a receipt. */
  get totalVerified(): string {
    return this.mySponsorships.reduce((sum, s) => sum + (Number(s.amount_received) || 0), 0)
      .toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  get totalAwaitingVerification(): string {
    return this.mySponsorships.reduce((sum, s) => sum + (Number(s.amount_pending) || 0), 0)
      .toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  loadSponsorData(): void {
    if (!this.loggedInSponsor) return;
    this.isLoadingSponsorship = true;
    this.apiService.getMySponsorships().subscribe({
      next: rows => { this.mySponsorships = rows || []; this.isLoadingSponsorship = false; },
      error: () => { this.isLoadingSponsorship = false; this.mySponsorships = []; },
    });
    this.apiService.getMySponsorPayments().subscribe({
      next: rows => (this.myPayments = rows || []),
      error: () => (this.myPayments = []),
    });
  }

  /** Records the sponsor's commitment. Starts pending until an admin confirms it. */
  savePledge(): void {
    const normalised = (this.pledgeAmountInput || '').replace(/[^0-9.]/g, '');
    if (!normalised || Number(normalised) <= 0) {
      this.paymentError = 'Enter the amount you are committing.';
      return;
    }
    this.isSavingPledge = true;
    this.paymentError = '';
    this.apiService.createMySponsorship({
      amount_pledged: normalised,
      tier: this.loggedInSponsor?.tier || '',
      sector: (this.loggedInSponsor as any)?.sector || '',
    }).subscribe({
      next: () => {
        this.isSavingPledge = false;
        this.pledgeAmountInput = '';
        this.loadSponsorData();
      },
      error: () => {
        this.isSavingPledge = false;
        this.paymentError = 'Could not record your commitment. Please try again.';
      },
    });
  }

  downloadCertificate(): void {
    this.viewCSRCertificate();
  }

  downloadVIPPass(): void {
    const sponsor = this.loggedInSponsor;
    const orgName = this.getSponsorName(sponsor);
    const repName = sponsor?.fullName || 'Corporate VIP Representative';
    const tier = sponsor?.tier || 'Corporate Partner';
    const token = sponsor?.ticket || 'NTIC-VIP-PASS';

    const passWindow = window.open('', '_blank', 'width=880,height=650');
    if (!passWindow) {
      this.dialogService.toast('Please allow popups to view and download your VIP Guest Pass.', 'warning');
      return;
    }

    passWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Partner Accreditation Pass -- ${orgName}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@600;700&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            background: #f1f5f9;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #0f172a;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 32px 20px;
          }
          .pass-card {
            width: 100%;
            max-width: 680px;
            background: #ffffff;
            border: 1px solid #cbd5e1;
            border-radius: 12px;
            box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08);
            overflow: hidden;
          }
          .pass-header {
            background: #003f87;
            color: #ffffff;
            padding: 24px 32px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .pass-jurisdiction {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 1px;
            text-transform: uppercase;
            color: #93c5fd;
            margin-bottom: 4px;
          }
          .pass-program {
            font-size: 18px;
            font-weight: 800;
            letter-spacing: -0.3px;
            color: #ffffff;
          }
          .pass-badge {
            background: rgba(255, 255, 255, 0.15);
            border: 1px solid rgba(255, 255, 255, 0.3);
            color: #ffffff;
            font-size: 11px;
            font-weight: 700;
            padding: 6px 12px;
            border-radius: 6px;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            white-space: nowrap;
          }
          .pass-body {
            padding: 32px;
          }
          .pass-entity {
            margin-bottom: 24px;
            padding-bottom: 20px;
            border-bottom: 1px solid #e2e8f0;
          }
          .pass-org-name {
            font-size: 24px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: -0.5px;
            margin-bottom: 4px;
          }
          .pass-tier-label {
            font-size: 13.5px;
            font-weight: 600;
            color: #003f87;
          }
          .pass-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
            margin-bottom: 24px;
          }
          .grid-cell {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 14px 16px;
          }
          .cell-label {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #64748b;
            margin-bottom: 4px;
          }
          .cell-value {
            font-size: 14px;
            font-weight: 700;
            color: #0f172a;
          }
          .pass-token-strip {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 16px 20px;
            margin-bottom: 24px;
          }
          .token-label {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #475569;
            margin-bottom: 2px;
          }
          .token-code {
            font-family: 'JetBrains Mono', Consolas, monospace;
            font-size: 16px;
            font-weight: 700;
            color: #003f87;
            letter-spacing: 1px;
          }
          .btn-print {
            background: #003f87;
            color: #ffffff;
            font-size: 13px;
            font-weight: 600;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
            transition: background-color 0.15s ease;
          }
          .btn-print:hover {
            background: #002e62;
          }
          .pass-footer {
            font-size: 12px;
            color: #64748b;
            line-height: 1.5;
            padding-top: 16px;
            border-top: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
          }
          .pass-security-seal {
            font-size: 11px;
            font-weight: 600;
            color: #475569;
            text-align: right;
            white-space: nowrap;
          }
          @media print {
            body { background: #ffffff; padding: 0; }
            .pass-card { border: 1px solid #0f172a; box-shadow: none; max-width: 100%; border-radius: 0; }
            .btn-print { display: none !important; }
            .pass-header { background: #003f87 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <div class="pass-card">
          <div class="pass-header">
            <div>
              <div class="pass-jurisdiction">Republic of Ghana &middot; Ministry of Education STEM Initiative</div>
              <div class="pass-program">National Technology &amp; Innovation Championship</div>
            </div>
            <div class="pass-badge">Accredited Partner</div>
          </div>
          <div class="pass-body">
            <div class="pass-entity">
              <h1 class="pass-org-name">${orgName}</h1>
              <div class="pass-tier-label">Official Accreditation: ${tier}</div>
            </div>
            <div class="pass-grid">
              <div class="grid-cell">
                <div class="cell-label">Authorized Representative</div>
                <div class="cell-value">${repName}</div>
              </div>
              <div class="grid-cell">
                <div class="cell-label">Accreditation Status</div>
                <div class="cell-value" style="color: #059669;">Active &middot; Provisioned</div>
              </div>
              <div class="grid-cell">
                <div class="cell-label">Credential Type</div>
                <div class="cell-value">Executive Corporate Pass</div>
              </div>
              <div class="grid-cell">
                <div class="cell-label">Governing Authority</div>
                <div class="cell-value">NTIC Championship Secretariat</div>
              </div>
            </div>
            <div class="pass-token-strip">
              <div>
                <div class="token-label">Accreditation Token ID</div>
                <div class="token-code">${token}</div>
              </div>
              <button class="btn-print" onclick="window.print()">Print Official Pass</button>
            </div>
            <div class="pass-footer">
              <div>Present this verified accreditation credential at the Executive Badging Desk for championship credentialing and venue access.</div>
              <div class="pass-security-seal">Auth ID: ${token}<br>System Verified</div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `);
    passWindow.document.close();
  }

  viewCSRCertificate(): void {
    const sponsor = this.loggedInSponsor;
    const orgName = this.getSponsorName(sponsor);
    const repName = sponsor?.fullName || 'Corporate Representative';
    const tier = sponsor?.tier || 'VIP Partner';
    const token = sponsor?.ticket || 'NTIC-SPO-VERIFIED';
    const issueDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    const certWindow = window.open('', '_blank', 'width=950,height=700');
    if (!certWindow) {
      this.dialogService.toast('Please allow popups to view and download your CSR Certificate.', 'warning');
      return;
    }

    certWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>CSR Recognition Certificate -- ${orgName}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@600&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            margin: 0;
            padding: 40px 20px;
            background: #f1f5f9;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #0f172a;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
          }
          .cert-card {
            width: 100%;
            max-width: 840px;
            background: #ffffff;
            border: 2px solid #003f87;
            outline: 1px solid #cbd5e1;
            outline-offset: -10px;
            padding: 48px 56px;
            border-radius: 8px;
            text-align: center;
            box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08);
          }
          .cert-jurisdiction {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            color: #003f87;
            margin-bottom: 8px;
          }
          .cert-header {
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.5px;
            color: #475569;
            text-transform: uppercase;
            margin-bottom: 24px;
          }
          .cert-title {
            font-size: 26px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: -0.5px;
            margin: 0 0 12px;
          }
          .cert-subtitle {
            font-size: 14px;
            color: #64748b;
            margin-bottom: 20px;
          }
          .cert-org {
            font-size: 28px;
            font-weight: 800;
            color: #003f87;
            margin: 12px 0 16px;
            display: inline-block;
          }
          .cert-badge {
            display: inline-block;
            background: #eff6ff;
            color: #1e40af;
            border: 1px solid #bfdbfe;
            padding: 6px 16px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 24px;
          }
          .cert-desc {
            font-size: 14.5px;
            line-height: 1.7;
            color: #334155;
            max-width: 660px;
            margin: 0 auto 36px;
          }
          .cert-meta {
            display: flex;
            justify-content: space-around;
            margin-top: 32px;
            padding-top: 24px;
            border-top: 1px solid #e2e8f0;
          }
          .cert-sig-block {
            text-align: center;
          }
          .cert-sig-line {
            width: 180px;
            border-bottom: 1.5px solid #cbd5e1;
            margin: 0 auto 8px;
          }
          .cert-sig-title {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #64748b;
          }
          .cert-token {
            font-family: 'JetBrains Mono', Consolas, monospace;
            font-size: 11px;
            color: #64748b;
            margin-top: 28px;
          }
          @media print {
            body { background: #ffffff; padding: 0; }
            .cert-card { box-shadow: none; max-width: 100%; border-radius: 0; }
          }
        </style>
      </head>
      <body>
        <div class="cert-card">
          <div class="cert-jurisdiction">Republic of Ghana &middot; Ministry of Education STEM Initiative</div>
          <div class="cert-header">National Technology &amp; Innovation Championship</div>
          <h1 class="cert-title">CERTIFICATE OF CSR RECOGNITION</h1>
          <div class="cert-subtitle">This official credential of appreciation is proudly awarded to</div>
          
          <div class="cert-org">${orgName}</div>
          <br>
          <div class="cert-badge">${tier}</div>

          <p class="cert-desc">
            In recognition of outstanding corporate social responsibility, leadership, and partnership in empowering Ghana's next generation of technology innovators and STEM champions during the <strong>National Technology &amp; Innovation Championship</strong>.
          </p>

          <div class="cert-meta">
            <div class="cert-sig-block">
              <div class="cert-sig-line"></div>
              <div class="cert-sig-title">Representative: ${repName}</div>
            </div>
            <div class="cert-sig-block">
              <div class="cert-sig-line"></div>
              <div class="cert-sig-title">NTIC Governing Secretariat</div>
            </div>
            <div class="cert-sig-block">
              <div style="font-weight:700;font-size:13px;color:#0f172a;">${issueDate}</div>
              <div class="cert-sig-title">Date of Issuance</div>
            </div>
          </div>

          <div class="cert-token">Verification Code: ${token}</div>
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 500);
          };
        </script>
      </body>
      </html>
    `);
    certWindow.document.close();
  }

  printTaxReceipt(receipt: SponsorPayment): void {
    const sponsor = this.loggedInSponsor;
    const name = this.getSponsorName(sponsor);
    const rep = sponsor?.fullName || 'Corporate Representative';
    const email = sponsor?.email || 'sponsor@company.com';
    const phone = sponsor?.phone || '--';
    const tier = sponsor?.tier || 'VIP Partner';
    const token = sponsor?.ticket || 'NTIC-SPO-TAX';
    const payments = sponsor?.payments || [];
    const total = this.getSponsorTotal(sponsor);
    const currentDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    const invoiceWindow = window.open('', '_blank', 'width=900,height=750');
    if (!invoiceWindow) {
      this.dialogService.toast('Please allow popups to view and print your Tax Receipt.', 'warning');
      return;
    }

    let paymentRowsHtml = '';
    if (payments.length > 0) {
      paymentRowsHtml = payments.map((p: any, idx: number) => `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${idx + 1}</td>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-family:monospace;">${p.refNo}</td>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${p.method}</td>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${p.date}</td>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:700;text-align:right;">${p.amount}</td>
        </tr>
      `).join('');
    } else {
      paymentRowsHtml = `
        <tr>
          <td colspan="5" style="padding:20px;text-align:center;color:#64748b;">No settlement transactions logged yet.</td>
        </tr>
      `;
    }

    invoiceWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>NTIC Tax Invoice & CSR Receipt -- ${name}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
          body {
            margin: 0;
            padding: 40px;
            font-family: 'Inter', sans-serif;
            color: #0f172a;
            background: #f8fafc;
          }
          .invoice-card {
            max-width: 800px;
            margin: 0 auto;
            background: #ffffff;
            border: 1px solid #cbd5e1;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05);
          }
          .inv-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #2563eb;
            padding-bottom: 20px;
            margin-bottom: 24px;
          }
          .inv-title {
            font-size: 24px;
            font-weight: 800;
            color: #2563eb;
            margin: 0 0 4px;
          }
          .inv-sub {
            font-size: 13px;
            color: #64748b;
          }
          .inv-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
            margin-bottom: 30px;
          }
          .inv-box {
            background: #f1f5f9;
            padding: 16px;
            border-radius: 8px;
            font-size: 13px;
          }
          .inv-box-title {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            color: #64748b;
            margin-bottom: 8px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
            margin-bottom: 24px;
          }
          th {
            background: #e2e8f0;
            padding: 10px;
            text-align: left;
            font-weight: 700;
            color: #334155;
          }
          .inv-summary {
            display: flex;
            justify-content: flex-end;
            margin-top: 20px;
          }
          .inv-total-box {
            background: #eff6ff;
            border: 1.5px solid #2563eb;
            padding: 16px 24px;
            border-radius: 8px;
            text-align: right;
          }
          @media print {
            body { background: #fff; padding: 0; }
            .invoice-card { box-shadow: none; border: none; }
          }
        </style>
      </head>
      <body>
        <div class="invoice-card">
          <div class="inv-header">
            <div>
              <h1 class="inv-title">NTIC FOUNDATION</h1>
              <div class="inv-sub">Official Tax Invoice & CSR Payment Receipt</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px;">TIN: <strong>C002938101-NTIC</strong></div>
            </div>
            <div style="text-align:right;">
              <div style="font-weight:700;font-size:14px;color:#0f172a;">RECEIPT REF: ${token}</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px;">Date: ${currentDate}</div>
            </div>
          </div>

          <div class="inv-grid">
            <div class="inv-box">
              <div class="inv-box-title">Billed Sponsor Organization</div>
              <div style="font-weight:700;font-size:15px;color:#0f172a;">${name}</div>
              <div>Attn: ${rep}</div>
              <div>Email: ${email}</div>
              <div>Phone: ${phone}</div>
            </div>
            <div class="inv-box">
              <div class="inv-box-title">Sponsorship Details</div>
              <div>Partnership Tier: <strong>${tier}</strong></div>
              <div>Access Token: <strong style="font-family:monospace;">${token}</strong></div>
              <div>Status: <strong style="color:#16a34a;">Verified Sponsor</strong></div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Transaction Ref</th>
                <th>Payment Channel</th>
                <th>Date Logged</th>
                <th style="text-align:right;">Amount Settled</th>
              </tr>
            </thead>
            <tbody>
              ${paymentRowsHtml}
            </tbody>
          </table>

          <div class="inv-summary">
            <div class="inv-total-box">
              <div style="font-size:12px;color:#64748b;font-weight:700;text-transform:uppercase;">Total Verified Contribution</div>
              <div style="font-size:24px;font-weight:800;color:#2563eb;margin-top:4px;">${total}</div>
            </div>
          </div>

          <div style="margin-top:40px;font-size:12px;color:#64748b;text-align:center;border-top:1px solid #e2e8f0;padding-top:16px;">
            Thank you for supporting the Ghana National NTI & Technology Championship.
          </div>
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 500);
          };
        </script>
      </body>
      </html>
    `);
    invoiceWindow.document.close();
  }

  loadEcosystemSummary(): void {
    this.isLoadingEcosystemSummary = true;
    this.apiService.getSponsorshipSummary().subscribe({
      next: summary => {
        this.ecosystemSummary = summary;
        this.isLoadingEcosystemSummary = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.ecosystemSummary = null;
        this.isLoadingEcosystemSummary = false;
        this.cdr.markForCheck();
      }
    });
  }

  loadPendingPayments(): void {
    this.isLoadingPendingPayments = true;
    this.apiService.getPendingSponsorPayments().subscribe({
      next: rows => {
        this.pendingPayments = rows || [];
        this.isLoadingPendingPayments = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.pendingPayments = [];
        this.isLoadingPendingPayments = false;
        this.cdr.markForCheck();
      }
    });
  }

  verifyPayment(payment: ApiSponsorPayment, verified: boolean): void {
    let reason = '';
    if (!verified) {
      const input = window.prompt('Please provide a reason for rejecting this payment reference:');
      if (!input || !input.trim()) {
        this.dialogService.toast('Rejection reason is required.', 'warning');
        return;
      }
      reason = input.trim();
    }
    this.isVerifyingPayment[payment.id] = true;
    this.apiService.verifySponsorPayment(payment.id, verified, reason).subscribe({
      next: () => {
        this.isVerifyingPayment[payment.id] = false;
        this.dialogService.toast(
          verified ? 'Payment confirmed and marked as verified.' : 'Payment has been rejected.',
          verified ? 'success' : 'info'
        );
        this.loadPendingPayments();
        this.loadEcosystemSummary();
        this.loadSponsorData();
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.isVerifyingPayment[payment.id] = false;
        this.dialogService.toast(err?.error?.detail || 'Failed to update payment verification state.', 'error');
        this.cdr.markForCheck();
      }
    });
  }

  get activeSponsors(): any[] {
    return this.contentService.users.filter(u => u.role === 'sponsor');
  }

  get totalCommitted(): string {
    if (this.ecosystemSummary?.total_committed) {
      return `GH₵ ${this.ecosystemSummary.total_committed}`;
    }
    return `${this.activeSponsors.length} sponsor${this.activeSponsors.length !== 1 ? 's' : ''}`;
  }

  get totalReceived(): string {
    if (this.ecosystemSummary?.total_received) {
      return `GH₵ ${this.ecosystemSummary.total_received}`;
    }
    return 'GH₵ 0';
  }

  get totalBeneficiaries(): number {
    return this.ecosystemSummary?.total_beneficiaries || 0;
  }

  get receivedPercentage(): number {
    return this.ecosystemSummary?.received_pct || 0;
  }
}
