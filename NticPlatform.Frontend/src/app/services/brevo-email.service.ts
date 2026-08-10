import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class BrevoEmailService {
  private readonly apiUrl = environment.apiUrl + '/send-email';

  constructor(private http: HttpClient) {}

  private send(toEmail: string, toName: string, subject: string, htmlContent: string): void {
    this.http.post(this.apiUrl, {
      to_email: toEmail,
      to_name: toName,
      subject,
      html_content: htmlContent
    }).subscribe({
      next: () => console.log('[Email] Sent to', toEmail),
      error: (err) => console.warn('[Email] Failed:', err?.error?.detail || err.message)
    });
  }

  sendPendingConfirmation(toEmail: string, toName: string, entityName: string, applicationType: string): void {
    this.send(
      toEmail, toName,
      `${applicationType} Received — NTIC Ghana Championship`,
      `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:24px;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:22px;">NTIC Ghana Championship</h1>
          <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:13px;">National Technology & Innovation Championship</p>
        </div>
        <div style="background:#f8fafc;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
          <p style="color:#475569;line-height:1.6;margin:0 0 16px;">Dear <strong>${toName}</strong>,</p>
          <p style="color:#475569;line-height:1.6;margin:0 0 16px;">We have received your <strong>${applicationType}</strong> for <strong>${entityName}</strong>. Your application is now under review.</p>
          <div style="background:#fffbeb;border:1px solid #fbbf24;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
            <p style="margin:0;color:#92400e;font-size:14px;"><strong>Status:</strong> Pending Review<br>You will receive another email once a decision has been made.</p>
          </div>
          <p style="color:#64748b;font-size:13px;margin:0;">Questions? Contact <a href="mailto:support@ntic.edu.gh" style="color:#4f46e5;">support@ntic.edu.gh</a></p>
        </div>
      </div>`
    );
  }

  sendApprovalEmail(toEmail: string, toName: string, entityName: string, applicationType: string, ticket: string, otp: string): void {
    this.send(
      toEmail, toName,
      `Application Approved — ${entityName} | NTIC Ghana`,
      `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <div style="background:linear-gradient(135deg,#065f46,#10b981);padding:24px;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:22px;">Application Approved!</h1>
          <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:13px;">NTIC Ghana Championship</p>
        </div>
        <div style="background:#f8fafc;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
          <p style="color:#475569;line-height:1.6;margin:0 0 16px;">Dear <strong>${toName}</strong>,</p>
          <p style="color:#475569;line-height:1.6;margin:0 0 16px;">Congratulations! Your <strong>${applicationType}</strong> for <strong>${entityName}</strong> has been <strong style="color:#065f46;">approved</strong>.</p>
          <div style="background:#ecfdf5;border:1px solid #34d399;border-radius:8px;padding:16px;margin:0 0 16px;">
            <p style="margin:0 0 8px;color:#065f46;font-size:14px;"><strong>Your Access Credentials:</strong></p>
            <p style="margin:0 0 4px;color:#064e3b;font-size:14px;">Access Pass: <code style="background:#fff;padding:2px 8px;border-radius:4px;font-weight:700;letter-spacing:1px;">${ticket}</code></p>
            <p style="margin:0;color:#064e3b;font-size:14px;">Login OTP: <code style="background:#fff;padding:2px 8px;border-radius:4px;font-weight:700;letter-spacing:1px;">${otp}</code></p>
          </div>
          <p style="color:#475569;line-height:1.6;margin:0 0 16px;">Use these credentials to log in to the NTIC Competition Platform. Please keep them secure.</p>
          <p style="color:#64748b;font-size:13px;margin:0;">Questions? Contact <a href="mailto:support@ntic.edu.gh" style="color:#4f46e5;">support@ntic.edu.gh</a></p>
        </div>
      </div>`
    );
  }

  sendRejectionEmail(toEmail: string, toName: string, entityName: string, applicationType: string, reasons: string, notes: string): void {
    const reasonList = reasons.split(',').map(r => `<li style="margin-bottom:4px;">${r.trim()}</li>`).join('');
    this.send(
      toEmail, toName,
      `Application Update — ${entityName} | NTIC Ghana`,
      `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <div style="background:linear-gradient(135deg,#991b1b,#ef4444);padding:24px;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:22px;">Application Update</h1>
          <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:13px;">NTIC Ghana Championship</p>
        </div>
        <div style="background:#f8fafc;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
          <p style="color:#475569;line-height:1.6;margin:0 0 16px;">Dear <strong>${toName}</strong>,</p>
          <p style="color:#475569;line-height:1.6;margin:0 0 16px;">After reviewing your <strong>${applicationType}</strong> for <strong>${entityName}</strong>, we are unable to approve it at this time.</p>
          <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:16px;margin:0 0 16px;">
            <p style="margin:0 0 8px;color:#991b1b;font-size:14px;"><strong>Reasons:</strong></p>
            <ul style="margin:0;padding-left:20px;color:#7f1d1d;font-size:14px;">${reasonList}</ul>
            ${notes ? `<p style="margin:12px 0 0;color:#7f1d1d;font-size:14px;"><strong>Additional Notes:</strong> ${notes}</p>` : ''}
          </div>
          <p style="color:#475569;line-height:1.6;margin:0 0 16px;">You may address the issues above and reapply through the NTIC Registration Portal.</p>
          <p style="color:#64748b;font-size:13px;margin:0;">Questions? Contact <a href="mailto:support@ntic.edu.gh" style="color:#4f46e5;">support@ntic.edu.gh</a></p>
        </div>
      </div>`
    );
  }

  sendOtpEmail(toEmail: string, otp: string): void {
    this.send(
      toEmail, toEmail.split('@')[0],
      'Your Verification Code — NTIC Ghana',
      `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
        <h2 style="color:#1a237e;">NTIC Ghana — Verification Code</h2>
        <p style="font-size:15px;color:#333;">Use the code below to verify your email address:</p>
        <div style="background:#f5f5f5;border-radius:12px;padding:20px;text-align:center;margin:24px 0;">
          <span style="font-size:32px;font-weight:800;letter-spacing:8px;color:#d4a017;">${otp}</span>
        </div>
        <p style="font-size:13px;color:#999;">This code expires in 5 minutes. Do not share it with anyone.</p>
        <p style="font-size:12px;color:#bbb;margin-top:24px;">NTIC Ghana National Championship</p>
      </div>`
    );
  }
}