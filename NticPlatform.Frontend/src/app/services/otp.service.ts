import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';
import { environment } from '../../environments/environment';

export type OtpChannel = 'email' | 'phone';
export type OtpPurpose = 'contact_verification' | 'draft_resume';

export interface OtpChallenge {
  challengeId: string;
  channel: OtpChannel;
  /** Partially hidden destination, safe to show in the UI. */
  targetMasked: string;
  expiresIn: number;
  maxAttempts: number;
}

export interface OtpVerification {
  verified: true;
  purpose: OtpPurpose;
  channel: OtpChannel;
  /** The full contact value, returned only after a successful check. */
  target: string;
  /**
   * Present for `draft_resume`. Proves to the server that this client received
   * the code sent to `target`, and is required to read that email's saved
   * registration draft. Short-lived.
   */
  resume_token?: string;
}

/**
 * One-time passcodes are generated, stored (hashed) and compared entirely on
 * the server. The browser only ever holds an opaque `challengeId`.
 *
 * Do NOT add a client-side code comparison here. The previous implementation
 * generated the code in the browser with Math.random() and compared it locally,
 * which meant anyone could "verify" a contact they did not own simply by
 * reading their own network tab or localStorage.
 */
@Injectable({ providedIn: 'root' })
export class OtpService {
  private readonly baseUrl = environment.apiUrl + '/otp';

  constructor(private http: HttpClient) {}

  request(purpose: OtpPurpose, channel: OtpChannel, target: string): Observable<OtpChallenge> {
    return this.http
      .post<{
        challenge_id: string;
        channel: OtpChannel;
        target_masked: string;
        expires_in: number;
        max_attempts: number;
      }>(`${this.baseUrl}/request`, { purpose, channel, target })
      .pipe(
        map(res => ({
          challengeId: res.challenge_id,
          channel: res.channel,
          targetMasked: res.target_masked,
          expiresIn: res.expires_in,
          maxAttempts: res.max_attempts,
        })),
        catchError(err => throwError(() => new Error(this.messageFor(err))))
      );
  }

  verify(challengeId: string, code: string): Observable<OtpVerification> {
    return this.http
      .post<OtpVerification>(`${this.baseUrl}/verify`, { challenge_id: challengeId, code })
      .pipe(catchError(err => throwError(() => new Error(this.messageFor(err)))));
  }

  /** Surface the server's reason to the user instead of a generic failure. */
  private messageFor(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const detail = err.error?.detail;
      if (typeof detail === 'string' && detail.trim()) return detail;
      if (err.status === 0) return 'Network error. Please check your connection and try again.';
      if (err.status === 429) return 'Too many attempts. Please wait a moment and try again.';
    }
    return 'Verification failed. Please try again.';
  }
}
