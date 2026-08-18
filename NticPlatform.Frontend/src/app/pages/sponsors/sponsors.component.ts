import { getAuthValue } from '../../services/session.util';
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContentService, SponsorPayment, User } from '../../services/content.service';
import { DialogService } from '../../services/dialog.service';
import { ApiService, Sponsorship, SponsorPayment as ApiSponsorPayment } from '../../services/api.service';

@Component({
  selector: 'app-sponsors',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sponsors.component.html',
  styleUrl: './sponsors.component.scss'
})
export class SponsorsComponent implements OnInit {
  constructor(
    public contentService: ContentService,
    public dialogService: DialogService,
    public apiService: ApiService,
  ) {}
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
  selectedPaymentMethod: 'Mobile Money' | 'Bank Transfer' | 'Corporate Cheque' | 'Card Online' = 'Bank Transfer';

  paymentForm: any = {
    amount: '',
    refNo: '',
    notes: '',
    // Card fields (cardName / cardNumber / cardExpiry / cardCvv) were removed.
    // Nothing in this app processes a card: submitPayment() only records a
    // reference number for an admin to verify against the real bank/MoMo
    // statement. Collecting a PAN and CVV to then discard them added genuine
    // cardholder-data risk for no function. Real card capture must go through a
    // payment provider's hosted fields so the data never enters this app.
    bankName: 'Ecobank Ghana',
    momoNetwork: 'MTN Mobile Money',
    momoNumber: '',
    chequeNo: '',
    issuingBank: 'Stanbic Bank Ghana'
  };

  isSubmittingPayment = false;
  paymentSuccessMessage = '';

  ngOnInit(): void {
    this.loadSponsorData();
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

    this.isSavingProfile = true;

    setTimeout(() => {
      this.isSavingProfile = false;
      const updatedUsers = this.contentService.users.map(u => {
        if (u.id === sponsor.id) {
          return {
            ...u,
            organization: this.profileEditForm.organization.trim() || u.fullName || 'Corporate Sponsor',
            fullName: this.profileEditForm.fullName.trim() || u.fullName,
            phone: this.profileEditForm.phone.trim() || u.phone,
            tier: this.profileEditForm.tier || u.tier,
            track: this.profileEditForm.track || u.track
          };
        }
        return u;
      });

      this.contentService.saveUsers(updatedUsers);
      this.contentService.saveAuditLogs([
        { action: `Sponsor profile updated for ${this.profileEditForm.organization || sponsor.email}`, user: sponsor.email, time: new Date().toISOString(), type: 'system' },
        ...this.contentService.auditLogs
      ]);

      this.profileSuccessMessage = 'Profile details updated successfully!';
      setTimeout(() => {
        this.closeEditProfileModal();
      }, 1000);
    }, 400);
  }

  get loggedInSponsor(): User | null {
    const activeRole = getAuthValue('activeRoleId');
    if (activeRole !== 'sponsor') return null;

    const email = getAuthValue('activeUserEmail') || '';
    const ticket = getAuthValue('activeUserTicket') || '';

    return this.contentService.users.find(u =>
      u.role === 'sponsor' && (
        (email && u.email?.toLowerCase() === email.toLowerCase()) ||
        (ticket && u.ticket?.toLowerCase() === ticket.toLowerCase())
      )
    ) || null;
  }

  get isSponsorLoggedIn(): boolean {
    return !!this.loggedInSponsor;
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

  openPaymentModal(): void {
    this.isPaymentModalOpen = true;
    this.paymentSuccessMessage = '';
    const sponsor = this.loggedInSponsor;
    this.paymentForm = {
      amount: '50,000',
      refNo: 'TXN-' + Math.floor(100000 + Math.random() * 900000),
      notes: '',
      bankName: 'Ecobank Ghana',
      momoNetwork: 'MTN Mobile Money',
      momoNumber: sponsor?.phone || '',
      chequeNo: '',
      issuingBank: 'Stanbic Bank Ghana'
    };
  }

  closePaymentModal(): void {
    this.isPaymentModalOpen = false;
  }

  /**
   * Records a payment reference against the sponsor's commitment.
   *
   * The previous version was a `setTimeout(600)` that built a payment object, ran
   * `parseInt(amount.replace(/[^0-9]/g,''))` to total it, and saved via
   * `contentService.saveUsers()` -> POST /api/bulk-sync. bulk-sync is admin-only, so
   * for the sponsor actually using this page it 403'd and the error was discarded:
   * the payment existed only in that browser, and no administrator ever saw it.
   *
   * Two further problems that fix themselves by moving server-side:
   *   * The running total was computed with parseInt on a formatted string, so
   *     "GH 1,500" became 1 and decimals were silently truncated. Amounts are now
   *     NUMERIC in the database.
   *   * Money was stored on the users row, with no verification state and no audit
   *     trail. It now has both.
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

    this.apiService.recordSponsorPayment(this.activeSponsorshipId, {
      amount: normalised,
      method: this.selectedPaymentMethod || 'bank_transfer',
      reference,
      notes: (this.paymentForm.notes || '').trim(),
    }).subscribe({
      next: () => {
        this.isSubmittingPayment = false;
        this.paymentSuccessMessage =
          'Payment reference recorded. Our team will verify it against the bank statement and confirm.';
        this.loadSponsorData();
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
        <title>CSR Impact Certificate -- ${orgName}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Inter:wght@400;600;700&display=swap');
          body {
            margin: 0;
            padding: 40px;
            background: #0f172a;
            font-family: 'Inter', sans-serif;
            color: #1e293b;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            box-sizing: border-box;
          }
          .cert-card {
            width: 100%;
            max-width: 860px;
            background: #ffffff;
            border: 12px solid #d97706;
            outline: 3px solid #f59e0b;
            padding: 50px 60px;
            border-radius: 12px;
            text-align: center;
            box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
            position: relative;
            box-sizing: border-box;
          }
          .cert-header {
            font-family: 'Cinzel', serif;
            font-size: 14px;
            letter-spacing: 4px;
            color: #d97706;
            font-weight: 700;
            text-transform: uppercase;
            margin-bottom: 8px;
          }
          .cert-title {
            font-family: 'Cinzel', serif;
            font-size: 32px;
            font-weight: 800;
            color: #0f172a;
            margin: 0 0 20px;
          }
          .cert-subtitle {
            font-size: 15px;
            color: #64748b;
            margin-bottom: 24px;
          }
          .cert-org {
            font-size: 30px;
            font-weight: 800;
            color: #2563eb;
            margin: 16px 0;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 12px;
            display: inline-block;
          }
          .cert-desc {
            font-size: 15px;
            line-height: 1.7;
            color: #334155;
            max-width: 680px;
            margin: 0 auto 30px;
          }
          .cert-meta {
            display: flex;
            justify-content: space-around;
            margin-top: 40px;
            padding-top: 24px;
            border-top: 1px solid #e2e8f0;
          }
          .cert-sig-block {
            text-align: center;
          }
          .cert-sig-line {
            width: 180px;
            border-bottom: 1.5px solid #94a3b8;
            margin: 0 auto 8px;
          }
          .cert-sig-title {
            font-size: 12px;
            font-weight: 700;
            color: #475569;
          }
          .cert-badge {
            display: inline-block;
            background: #fef3c7;
            color: #92400e;
            padding: 6px 16px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 700;
            margin-bottom: 20px;
          }
          .cert-token {
            font-family: monospace;
            font-size: 12px;
            color: #64748b;
            margin-top: 20px;
          }
          @media print {
            body { background: #fff; padding: 0; }
            .cert-card { box-shadow: none; border-color: #d97706; }
          }
        </style>
      </head>
      <body>
        <div class="cert-card">
          <div class="cert-header">National Technology & Innovation Championship</div>
          <h1 class="cert-title">CERTIFICATE OF CSR RECOGNITION</h1>
          <div class="cert-subtitle">This official certificate of appreciation is proudly presented to</div>
          
          <div class="cert-org">${orgName}</div>
          <br>
          <div class="cert-badge">${tier}</div>

          <p class="cert-desc">
            In recognition of outstanding corporate social responsibility, leadership, and generous financial partnership in empowering Ghana's next generation of NTI innovators, engineers, and digital champions during the <strong>NTIC National Championship</strong>.
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
      paymentRowsHtml = payments.map((p, idx) => `
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

  get activeSponsors(): any[] {
    return this.contentService.users.filter(u => u.role === 'sponsor');
  }

  get totalCommitted(): string {
    return `${this.activeSponsors.length} sponsor${this.activeSponsors.length !== 1 ? 's' : ''}`;
  }
}
