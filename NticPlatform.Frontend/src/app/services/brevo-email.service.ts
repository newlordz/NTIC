import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class BrevoEmailService {
  /** Generic sender. Requires a signed-in user (staff-only flows). */
  private readonly apiUrl = environment.apiUrl + '/send-email';
  /** Server-templated notice usable by the anonymous registration flow. */
  private readonly registrationNoticeUrl = environment.apiUrl + '/notify/registration-received';

  constructor(private http: HttpClient) {}

  private send(toEmail: string, toName: string, subject: string, htmlContent: string): void {
    this.http.post(this.apiUrl, {
      to_email: toEmail,
      to_name: toName,
      subject,
      html_content: htmlContent
    }).subscribe({
      next: () => {},
      error: (err) => console.warn('[Email] Failed:', err?.error?.detail || err.message)
    });
  }

  /**
   * "We received your application" notice.
   *
   * Sent from the pre-login registration flow, so it goes through a dedicated
   * endpoint that renders the body server-side. The generic /send-email route
   * requires a session precisely because arbitrary HTML to an arbitrary
   * recipient is a mail-relay primitive.
   */
  sendPendingConfirmation(toEmail: string, toName: string, entityName: string, applicationType: string): void {
    this.http.post(this.registrationNoticeUrl, {
      to_email: toEmail,
      to_name: toName,
      entity_name: entityName,
      application_type: applicationType
    }).subscribe({
      next: () => {},
      error: (err) => console.warn('[Email] Registration notice failed:', err?.error?.detail || err.message)
    });
  }

  sendApprovalEmail(toEmail: string, toName: string, entityName: string, applicationType: string, ticket: string, otp: string): void {
    this.send(
      toEmail, toName,
      `Application Approved -- ${entityName} | NTIC Ghana`,
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
      `Application Update -- ${entityName} | NTIC Ghana`,
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

  // NOTE: sendOtpEmail() was deliberately removed.
  //
  // It took the verification code as an argument, which meant the code was
  // generated in the browser and travelled through the caller's own network
  // request -- visible in DevTools. Anyone could therefore "verify" a contact
  // they did not own. One-time codes are now generated, delivered and checked
  // entirely server-side via OtpService -> POST /api/otp/request | /api/otp/verify.
  // Do not add a client-side OTP sender back to this service.
}
