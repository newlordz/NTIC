import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContentService, SponsorPayment, User } from '../../services/content.service';

@Component({
  selector: 'app-sponsors',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sponsors.component.html',
  styleUrl: './sponsors.component.scss'
})
export class SponsorsComponent implements OnInit {
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
    bankName: 'Ecobank Ghana',
    momoNetwork: 'MTN Mobile Money',
    momoNumber: '',
    cardName: '',
    cardNumber: '',
    cardExpiry: '',
    cardCvv: '',
    chequeNo: '',
    issuingBank: 'Stanbic Bank Ghana'
  };

  isSubmittingPayment = false;
  paymentSuccessMessage = '';

  constructor(public contentService: ContentService) {}

  ngOnInit(): void {}

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
    const activeRole = localStorage.getItem('activeRoleId');
    if (activeRole !== 'sponsor') return null;

    const email = localStorage.getItem('activeUserEmail') || '';
    const ticket = localStorage.getItem('activeUserTicket') || '';

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
      cardName: sponsor?.fullName || '',
      cardNumber: '',
      cardExpiry: '',
      cardCvv: '',
      chequeNo: '',
      issuingBank: 'Stanbic Bank Ghana'
    };
  }

  closePaymentModal(): void {
    this.isPaymentModalOpen = false;
  }

  submitPayment(): void {
    if (!this.paymentForm.amount.trim() || !this.paymentForm.refNo.trim()) {
      alert('Please enter both the payment amount and reference number.');
      return;
    }

    this.isSubmittingPayment = true;

    setTimeout(() => {
      this.isSubmittingPayment = false;
      const sponsor = this.loggedInSponsor;
      if (sponsor) {
        const newPayment: SponsorPayment = {
          id: 'pay-' + Date.now(),
          refNo: this.paymentForm.refNo.trim(),
          amount: 'GH₵ ' + this.paymentForm.amount.trim(),
          method: this.selectedPaymentMethod,
          status: 'Confirmed',
          date: new Date().toISOString().split('T')[0],
          notes: this.paymentForm.notes.trim() || undefined
        };

        const existingPayments = sponsor.payments || [];
        const updatedPayments = [newPayment, ...existingPayments];

        // Calculate new total
        const totalNum = updatedPayments.reduce((acc, p) => {
          return acc + (parseInt(p.amount.replace(/[^0-9]/g, ''), 10) || 0);
        }, 0);

        const updatedUsers = this.contentService.users.map(u => {
          if (u.id === sponsor.id) {
            return {
              ...u,
              total: `GH₵ ${totalNum.toLocaleString()}`,
              payments: updatedPayments
            };
          }
          return u;
        });

        this.contentService.saveUsers(updatedUsers);
        this.contentService.saveAuditLogs([
          { action: `Payment of ${newPayment.amount} recorded (${newPayment.method} Ref: ${newPayment.refNo})`, user: sponsor.email, time: new Date().toISOString(), type: 'system' },
          ...this.contentService.auditLogs
        ]);

        this.paymentSuccessMessage = 'Payment submitted and verified successfully!';
        setTimeout(() => {
          this.closePaymentModal();
        }, 1200);
      }
    }, 600);
  }

  downloadCertificate(): void {
    const sponsor = this.loggedInSponsor;
    const orgName = this.getSponsorName(sponsor);
    const repName = sponsor?.fullName || 'Corporate Representative';
    const tier = sponsor?.tier || 'VIP Partner';
    const token = sponsor?.ticket || 'NTIC-SPO-VERIFIED';
    const issueDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    const certWindow = window.open('', '_blank', 'width=950,height=700');
    if (!certWindow) {
      alert('Please allow popups to view and download your CSR Certificate.');
      return;
    }

    certWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>CSR Impact Certificate — ${orgName}</title>
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
            In recognition of outstanding corporate social responsibility, leadership, and generous financial partnership in empowering Ghana's next generation of STEM innovators, engineers, and digital champions during the <strong>NTIC National Championship</strong>.
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

  viewReport(sponsorName: string): void {
    this.downloadTaxReceipt(sponsorName);
  }

  downloadTaxReceipt(sponsorName?: string): void {
    const sponsor = this.loggedInSponsor;
    const name = sponsorName || this.getSponsorName(sponsor);
    const rep = sponsor?.fullName || 'Corporate Representative';
    const email = sponsor?.email || 'sponsor@company.com';
    const phone = sponsor?.phone || '—';
    const tier = sponsor?.tier || 'VIP Partner';
    const token = sponsor?.ticket || 'NTIC-SPO-TAX';
    const payments = sponsor?.payments || [];
    const total = this.getSponsorTotal(sponsor);
    const currentDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    const invoiceWindow = window.open('', '_blank', 'width=900,height=750');
    if (!invoiceWindow) {
      alert('Please allow popups to view and print your Tax Receipt.');
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
        <title>NTIC Tax Invoice & CSR Receipt — ${name}</title>
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
              <h1 class="inv-title">NTIC STEM FOUNDATION</h1>
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
            Thank you for supporting the Ghana National STEM & Technology Championship.
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
