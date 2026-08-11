import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface SmsResponse {
  success: boolean;
  textId?: string;
  quotaRemaining?: number;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SmsService {
  // Self-hosted Textbelt server URL (e.g. 'http://localhost:9090/text' or custom server)
  // Set to public hosted 'https://textbelt.com/text' if not self-hosting.
  private selfHostedServerUrl = (environment as any).textbeltUrl || 'http://localhost:9090/text';
  private publicHostedUrl = 'https://textbelt.com/text';
  private defaultApiKey = 'textbelt';

  constructor(private http: HttpClient) {}

  /**
   * Set a custom self-hosted Textbelt server endpoint URL.
   * Self-hosted servers send UNLIMITED texts for free without quota restrictions.
   */
  setServerUrl(url: string): void {
    this.selfHostedServerUrl = url;
  }

  sendSms(phone: string, message: string, options?: { isSelfHosted?: boolean; apiKey?: string; region?: 'us' | 'intl' | 'canada' }): Observable<SmsResponse> {
    const isSelfHosted = options?.isSelfHosted ?? true;
    const targetUrl = isSelfHosted ? this.selfHostedServerUrl : this.publicHostedUrl;
    
    // Format phone number (ensure international format e.g. +233 for Ghana)
    let formattedPhone = phone.trim();
    if (formattedPhone.startsWith('0') && formattedPhone.length === 10) {
      formattedPhone = '+233' + formattedPhone.substring(1);
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+' + formattedPhone;
    }

    const payload: any = {
      phone: formattedPhone,
      number: formattedPhone, // Textbelt supports both 'phone' and 'number'
      message
    };

    if (!isSelfHosted) {
      payload.key = options?.apiKey || this.defaultApiKey;
    }

    if (options?.region) {
      payload.region = options.region;
    }

    return this.http.post<SmsResponse>(targetUrl, payload).pipe(
      map(res => {
        if (!res.success) {
          console.warn('[Textbelt SMS] Warning:', res.error);
        } else {
          console.log('[Textbelt SMS] Text sent successfully:', res);
        }
        return res;
      }),
      catchError(err => {
        // Fallback to public hosted endpoint if self-hosted server is unreachable
        if (isSelfHosted) {
          console.warn('[Textbelt SMS] Self-hosted server unreachable. Falling back to public endpoint...');
          return this.sendSms(phone, message, { ...options, isSelfHosted: false });
        }
        console.error('[Textbelt SMS] Network error:', err);
        return of({
          success: false,
          error: err?.message || 'Network error sending SMS via Textbelt.'
        });
      })
    );
  }

  private whatsappGatewayUrl = (environment as any).whatsappGatewayUrl || 'http://localhost:3001';

  sendOtpSms(phone: string, otpCode: string): Observable<SmsResponse> {
    const message = `NTIC Competition: Your OTP code is ${otpCode}. Do not share this code.`;
    // Try sending via WhatsApp Gateway first (unlimited free), with fallback to SMS
    this.sendWhatsAppOtp(phone, otpCode).subscribe();
    return this.sendSms(phone, message);
  }

  sendCredentialsSms(phone: string, fullName: string, ticket: string, pin: string): Observable<SmsResponse> {
    const message = `NTIC Platform: Welcome ${fullName}! Ticket: ${ticket}, PIN: ${pin}. Log in at https://ntic.edu.gh`;
    // Try sending via WhatsApp Gateway first (unlimited free), with fallback to SMS
    this.sendWhatsAppCredentials(phone, fullName, ticket, pin).subscribe();
    return this.sendSms(phone, message);
  }

  // --- UNLIMITED WHATSAPP GATEWAY INTEGRATION ---
  sendWhatsAppMessage(phone: string, message: string): Observable<SmsResponse> {
    const url = `${this.whatsappGatewayUrl}/send`;
    return this.http.post<SmsResponse>(url, { phone, message }).pipe(
      map(res => {
        console.log('[WhatsApp Gateway] Notification response:', res);
        return res;
      }),
      catchError(err => {
        console.warn('[WhatsApp Gateway] Could not connect to local WhatsApp service:', err?.message);
        return of({ success: false, error: err?.message || 'WhatsApp Gateway offline' });
      })
    );
  }

  sendWhatsAppOtp(phone: string, otp: string): Observable<SmsResponse> {
    const url = `${this.whatsappGatewayUrl}/send-otp`;
    return this.http.post<SmsResponse>(url, { phone, otp }).pipe(
      catchError(err => of({ success: false, error: err?.message }))
    );
  }

  sendWhatsAppCredentials(phone: string, fullName: string, ticket: string, pin: string): Observable<SmsResponse> {
    const url = `${this.whatsappGatewayUrl}/send-credentials`;
    return this.http.post<SmsResponse>(url, { phone, fullName, ticket, pin }).pipe(
      catchError(err => of({ success: false, error: err?.message }))
    );
  }
}

