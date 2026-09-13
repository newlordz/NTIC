import { Component, OnInit, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, SponsorPayment, Sponsorship, SponsorshipSummary } from '../../../services/api.service';
import { DialogService } from '../../../services/dialog.service';

@Component({
  selector: 'app-treasury-portal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './treasury-portal.component.html',
  styleUrl: './treasury-portal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TreasuryPortalComponent implements OnInit {
  @Output() backToControl = new EventEmitter<void>();

  sponsorSummary: SponsorshipSummary | null = null;
  allSponsorships: Sponsorship[] = [];
  treasuryPayments: SponsorPayment[] = [];
  isLoadingTreasury = false;
  treasuryFilter: 'all' | 'pending_verification' | 'verified' | 'rejected' = 'all';
  treasurySearch = '';
  isVerifyingTreasuryPayment: { [id: string]: boolean } = {};
  isEmailingReceipt: { [id: string]: boolean } = {};

  // Direct settlement recording modal
  isDirectSettlementModalOpen = false;
  isSubmittingDirectSettlement = false;
  directSettlementForm = {
    sponsorshipId: '',
    amount: '',
    method: 'Bank Wire',
    reference: '',
    notes: '',
    proofUrl: '',
    date: new Date().toISOString().substring(0, 10)
  };
  isUploadingDirectProof = false;
  directProofFileName = '';

  get isDuplicateReference(): boolean {
    const ref = (this.directSettlementForm.reference || '').trim().toLowerCase();
    if (!ref) return false;
    return (this.treasuryPayments || []).some(p => (p.reference || '').trim().toLowerCase() === ref);
  }

  constructor(
    private apiService: ApiService,
    private dialogService: DialogService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadTreasuryData();
  }

  loadTreasuryData(): void {
    this.isLoadingTreasury = true;
    this.cdr.markForCheck();

    this.apiService.getSponsorshipSummary().subscribe({
      next: summary => {
        this.sponsorSummary = summary;
        this.cdr.markForCheck();
      },
      error: () => {
        this.sponsorSummary = null;
        this.cdr.markForCheck();
      }
    });

    this.apiService.getAllSponsorships().subscribe({
      next: rows => {
        this.allSponsorships = rows || [];
        this.cdr.markForCheck();
      },
      error: () => {
        this.allSponsorships = [];
        this.cdr.markForCheck();
      }
    });

    this.apiService.getAllSponsorPayments('all').subscribe({
      next: payments => {
        this.treasuryPayments = payments || [];
        this.isLoadingTreasury = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.treasuryPayments = [];
        this.isLoadingTreasury = false;
        this.cdr.markForCheck();
      }
    });
  }

  formatCedis(amount: string | number | null | undefined): string {
    if (amount === null || amount === undefined || amount === '') return 'GH₵ 0';
    const n = Number(amount);
    if (!isFinite(n)) return 'GH₵ 0';
    return 'GH₵ ' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  get filteredTreasuryPayments(): SponsorPayment[] {
    let list = this.treasuryPayments || [];
    if (this.treasuryFilter !== 'all') {
      list = list.filter(p => p.status === this.treasuryFilter);
    }
    if (this.treasurySearch && this.treasurySearch.trim()) {
      const q = this.treasurySearch.trim().toLowerCase();
      list = list.filter(p =>
        (p.reference && p.reference.toLowerCase().includes(q)) ||
        (p.organization && p.organization.toLowerCase().includes(q)) ||
        (p.sponsor_email && p.sponsor_email.toLowerCase().includes(q)) ||
        (p.notes && p.notes.toLowerCase().includes(q)) ||
        (p.method && p.method.toLowerCase().includes(q))
      );
    }
    return list;
  }

  get treasuryPendingCount(): number {
    return (this.treasuryPayments || []).filter(p => p.status === 'pending_verification').length;
  }

  get treasuryVerifiedCount(): number {
    return (this.treasuryPayments || []).filter(p => p.status === 'verified').length;
  }

  get treasuryRejectedCount(): number {
    return (this.treasuryPayments || []).filter(p => p.status === 'rejected').length;
  }

  verifyTreasuryPayment(payment: SponsorPayment, verified: boolean): void {
    if (!payment?.id) return;
    const paymentId = payment.id;
    let reason = '';
    if (!verified) {
      const promptReason = prompt('Enter a reason for rejecting this payment claim:');
      if (!promptReason || !promptReason.trim()) {
        this.dialogService.toast('A reason is required when rejecting a payment claim.', 'warning');
        return;
      }
      reason = promptReason.trim();
    }

    this.isVerifyingTreasuryPayment[paymentId] = true;
    this.cdr.markForCheck();

    this.apiService.verifySponsorPayment(paymentId, verified, reason).subscribe({
      next: () => {
        this.isVerifyingTreasuryPayment[paymentId] = false;
        this.dialogService.toast(
          verified ? `Payment ${payment.reference} confirmed and receipt generated.` : `Payment ${payment.reference} rejected.`,
          'success'
        );
        this.loadTreasuryData();
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.isVerifyingTreasuryPayment[paymentId] = false;
        const msg = err?.error?.detail || 'Could not verify payment. Please try again.';
        this.dialogService.toast(msg, 'error');
        this.cdr.markForCheck();
      }
    });
  }

  openDirectSettlementModal(): void {
    this.directSettlementForm = {
      sponsorshipId: this.allSponsorships[0]?.id || '',
      amount: '',
      reference: '',
      method: 'Bank Wire',
      notes: '',
      proofUrl: '',
      date: new Date().toISOString().substring(0, 10)
    };
    this.directProofFileName = '';
    this.isDirectSettlementModalOpen = true;
    this.cdr.markForCheck();
  }

  closeDirectSettlementModal(): void {
    this.isDirectSettlementModalOpen = false;
    this.cdr.markForCheck();
  }

  onDirectProofFileSelected(event: any): void {
    const file = event?.target?.files?.[0];
    if (!file) return;
    this.isUploadingDirectProof = true;
    this.directProofFileName = file.name;
    this.cdr.markForCheck();

    this.apiService.uploadFileBlob(file).subscribe({
      next: (res: any) => {
        this.isUploadingDirectProof = false;
        this.directSettlementForm.proofUrl = res.url || res.file_url || (res.file_id ? `/api/files/${res.file_id}` : '');
        this.dialogService.toast('Payment slip attached successfully.', 'success');
        this.cdr.markForCheck();
      },
      error: () => {
        this.isUploadingDirectProof = false;
        this.dialogService.toast('Could not upload bank slip. Try again.', 'error');
        this.cdr.markForCheck();
      }
    });
  }

  submitDirectSettlement(): void {
    if (!this.directSettlementForm.sponsorshipId) {
      this.dialogService.toast('Please select an accredited sponsor organization.', 'warning');
      return;
    }
    const amount = (this.directSettlementForm.amount || '').trim().replace(/[^0-9.]/g, '');
    if (!amount || Number(amount) <= 0) {
      this.dialogService.toast('Please enter a valid remittance amount.', 'warning');
      return;
    }
    const ref = (this.directSettlementForm.reference || '').trim();
    if (!ref) {
      this.dialogService.toast('Please enter a bank deposit reference or cheque number.', 'warning');
      return;
    }

    this.isSubmittingDirectSettlement = true;
    this.cdr.markForCheck();

    this.apiService.recordSponsorPayment(this.directSettlementForm.sponsorshipId, {
      amount,
      method: this.directSettlementForm.method,
      reference: ref,
      notes: this.directSettlementForm.notes.trim() || undefined,
      proof_file_url: this.directSettlementForm.proofUrl || undefined
    }).subscribe({
      next: () => {
        this.isSubmittingDirectSettlement = false;
        this.dialogService.toast(`Remittance of GH₵ ${amount} recorded and verified.`, 'success');
        this.closeDirectSettlementModal();
        this.loadTreasuryData();
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.isSubmittingDirectSettlement = false;
        const msg = err?.status === 409 ? 'A payment with that reference already exists.' : (err?.error?.detail || 'Failed to record remittance.');
        this.dialogService.toast(msg, 'error');
        this.cdr.markForCheck();
      }
    });
  }

  printPaymentTaxReceipt(payment: SponsorPayment): void {
    if (!payment) return;
    const org = payment.organization || 'Corporate Partner';
    const amount = payment.amount;
    const ref = payment.reference;
    const method = payment.method || 'Bank Wire';
    const date = payment.verified_at || payment.created_at || new Date().toISOString();
    const verifiedBy = payment.verified_by_name || 'NTIC Treasury Secretariat';
    const printDate = new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    const win = window.open('', '_blank', 'width=850,height=750');
    if (!win) {
      this.dialogService.toast('Please allow popups to print official CSR tax receipts.', 'warning');
      return;
    }

    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>CSR Tax Receipt -- ${ref} -- ${org}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@600&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Inter', -apple-system, sans-serif; background: #f8fafc; color: #0f172a; padding: 40px 20px; display: flex; justify-content: center; }
          .receipt-card { width: 100%; max-width: 760px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; padding: 40px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); }
          .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 24px; border-bottom: 2px solid #003f87; margin-bottom: 24px; }
          .brand-title { font-size: 18px; font-weight: 800; color: #003f87; }
          .brand-sub { font-size: 11.5px; color: #64748b; margin-top: 2px; }
          .receipt-badge { background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
          .grid-cell { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; }
          .cell-lbl { font-size: 10.5px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
          .cell-val { font-size: 14px; font-weight: 700; color: #0f172a; }
          .amount-banner { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 18px 20px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
          .amount-val { font-size: 24px; font-weight: 800; color: #15803d; }
          .footer { font-size: 11.5px; color: #64748b; line-height: 1.5; border-top: 1px solid #e2e8f0; padding-top: 20px; display: flex; justify-content: space-between; align-items: center; }
          @media print { body { background: #fff; padding: 0; } .receipt-card { border: 1px solid #000; box-shadow: none; max-width: 100%; border-radius: 0; } .btn-print { display: none !important; } }
        </style>
      </head>
      <body>
        <div class="receipt-card">
          <div class="header">
            <div>
              <div style="font-size:10.5px;font-weight:700;color:#003f87;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px;">Republic of Ghana &middot; Ministry of Education STEM Initiative</div>
              <h1 class="brand-title">National Technology &amp; Innovation Championship</h1>
              <p class="brand-sub">Official Corporate Social Responsibility (CSR) Tax Receipt &middot; Treasury Secretariat</p>
            </div>
            <div style="text-align:right;">
              <span class="receipt-badge">Verified Settlement</span>
              <div style="font-family:monospace;font-size:12px;font-weight:700;color:#334155;margin-top:6px;">RCT-${ref}</div>
            </div>
          </div>

          <div class="amount-banner">
            <div>
              <div style="font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.5px;">Remittance Settled &amp; Verified</div>
              <div style="font-size:12px;color:#4ade80;margin-top:2px;">Credited to NTIC STEM Innovation Fund</div>
            </div>
            <div class="amount-val">GH₵ ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>

          <div class="grid">
            <div class="grid-cell">
              <div class="cell-lbl">Contributing Partner Organization</div>
              <div class="cell-val">${org}</div>
              <div style="font-size:11.5px;color:#64748b;margin-top:2px;">${payment.sponsor_email || 'Accredited Corporate Sponsor'}</div>
            </div>
            <div class="grid-cell">
              <div class="cell-lbl">Transaction Reference</div>
              <div class="cell-val" style="font-family:monospace;">${ref}</div>
              <div style="font-size:11.5px;color:#64748b;margin-top:2px;">Channel: ${method}</div>
            </div>
            <div class="grid-cell">
              <div class="cell-lbl">Clearing &amp; Value Date</div>
              <div class="cell-val">${printDate}</div>
              <div style="font-size:11.5px;color:#64748b;margin-top:2px;">Fiscal Year 2026</div>
            </div>
            <div class="grid-cell">
              <div class="cell-lbl">Verified &amp; Certified By</div>
              <div class="cell-val">${verifiedBy}</div>
              <div style="font-size:11.5px;color:#16a34a;font-weight:600;margin-top:2px;">&bull; Cryptographically Logged</div>
            </div>
          </div>

          ${payment.notes ? `
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:24px;">
            <div class="cell-lbl">Administrative Memo</div>
            <div style="font-size:12.5px;color:#334155;line-height:1.4;">${payment.notes}</div>
          </div>` : ''}

          <div class="footer">
            <div>
              <strong>NTIC National Secretariat</strong> &middot; Account Ref: 2026-GH-NTIC-TR<br/>
              This official document serves as a tax-deductible educational grant receipt under Ghana Revenue Authority (GRA) Corporate Philanthropy Guidelines.
            </div>
            <button class="btn-print" onclick="window.print()" style="padding:8px 16px;background:#003f87;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">
              Print Receipt
            </button>
          </div>
        </div>
      </body>
      </html>
    `);
    win.document.close();
  }

  emailReceipt(payment: SponsorPayment): void {
    if (!payment?.id) return;
    const defaultEmail = payment.sponsor_email || '';
    const promptEmail = prompt(
      `Enter destination email address for CSR Tax Receipt (leave blank to use default: ${defaultEmail || 'none registered'}):`,
      defaultEmail
    );
    if (promptEmail === null) return; // Cancelled
    const targetEmail = promptEmail.trim() || defaultEmail;
    if (!targetEmail) {
      this.dialogService.toast('A destination email address is required to dispatch the receipt.', 'warning');
      return;
    }

    const id = payment.id;
    this.isEmailingReceipt[id] = true;
    this.cdr.markForCheck();

    this.apiService.emailSponsorPaymentReceipt(id, targetEmail).subscribe({
      next: res => {
        this.isEmailingReceipt[id] = false;
        this.dialogService.toast(`CSR Tax Receipt successfully dispatched to ${res.recipient}.`, 'success');
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.isEmailingReceipt[id] = false;
        const msg = err?.error?.detail || 'Failed to email receipt. Please verify Brevo SMTP credentials.';
        this.dialogService.toast(msg, 'error');
        this.cdr.markForCheck();
      }
    });
  }
}
