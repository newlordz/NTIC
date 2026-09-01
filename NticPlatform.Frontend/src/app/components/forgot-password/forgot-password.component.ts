import { Component, EventEmitter, Input, Output, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { OtpService } from '../../services/otp.service';

type Step = 'email' | 'otp' | 'reset' | 'done';

/**
 * Forgot-password popup: email -> OTP -> new password.
 *
 * One shared component rather than duplicated markup and state in every page
 * that has a sign-in form. The security rules live on the server: a code is only
 * issued for an email that exists, the code is verified server-side, and the
 * single-use reset token is only minted after that verification.
 */
@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
})
export class ForgotPasswordComponent implements OnInit {
  /** Pre-fill from whatever the user already typed into the sign-in form. */
  @Input() initialEmail = '';
  /** Dark theme for the landing page's console-style modal; light elsewhere. */
  @Input() theme: 'light' | 'dark' = 'light';

  @Output() closed = new EventEmitter<void>();
  /** Emits the email whose password was reset, so the host can pre-fill sign-in. */
  @Output() resetComplete = new EventEmitter<string>();

  step: Step = 'email';
  email = '';
  code = '';
  newPassword = '';
  confirmPassword = '';
  error = '';
  busy = false;
  /** Masked destination the server says the code went to. */
  targetMasked = '';
  isPasswordVisible = false;

  private challengeId = '';
  private resetToken = '';

  constructor(
    private apiService: ApiService,
    private otpService: OtpService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.email = this.initialEmail || '';
  }

  get stepIndex(): number {
    return this.step === 'email' ? 0 : this.step === 'otp' ? 1 : 2;
  }

  get heading(): string {
    switch (this.step) {
      case 'email': return 'Reset your password';
      case 'otp': return 'Check your email';
      case 'reset': return 'Choose a new password';
      default: return 'Password updated';
    }
  }

  get subheading(): string {
    switch (this.step) {
      case 'email': return "Enter your account email and we'll send you a verification code.";
      case 'otp': return `Enter the 6-digit code sent to ${this.targetMasked || 'your email'}.`;
      case 'reset': return 'Pick something you have not used here before.';
      default: return 'You can now sign in with your new password.';
    }
  }

  get stepIcon(): string {
    switch (this.step) {
      case 'email': return 'mail';
      case 'otp': return 'pin';
      case 'reset': return 'lock_reset';
      default: return 'check_circle';
    }
  }

  close(): void {
    this.closed.emit();
  }

  submit(): void {
    if (this.busy) return;
    if (this.step === 'email') return this.sendCode();
    if (this.step === 'otp') return this.confirmCode();
    if (this.step === 'reset') return this.savePassword();
    this.close();
  }

  private sendCode(): void {
    const email = this.email.trim();
    if (!email) {
      this.error = 'Please enter your email address.';
      this.cdr.markForCheck();
      return;
    }
    this.busy = true;
    this.error = '';
    this.cdr.markForCheck();

    this.apiService.forgotPassword(email).subscribe({
      next: res => {
        this.busy = false;
        // The server deliberately does not say whether the email is registered.
        // A challenge id only comes back for a real account, so only a real
        // account can actually complete the reset.
        this.challengeId = res?.challenge_id || '';
        this.targetMasked = res?.target_masked || '';
        this.step = 'otp';
        this.cdr.markForCheck();
      },
      error: err => {
        this.busy = false;
        this.error = err?.error?.detail || err?.message || 'Could not send the code. Please try again.';
        this.cdr.markForCheck();
      },
    });
  }

  private confirmCode(): void {
    const code = this.code.trim();
    if (!code) {
      this.error = 'Please enter the code from your email.';
      this.cdr.markForCheck();
      return;
    }
    if (!this.challengeId) {
      // No challenge means the email was not registered. Say so only at this
      // point, and without confirming which part was wrong.
      this.error = 'That code is not valid. Check the email address and try again.';
      this.cdr.markForCheck();
      return;
    }
    this.busy = true;
    this.error = '';
    this.cdr.markForCheck();

    this.otpService.verify(this.challengeId, code).subscribe({
      next: res => {
        this.busy = false;
        this.resetToken = res?.reset_token || '';
        if (!this.resetToken) {
          this.error = 'Verified, but the reset could not be started. Please try again.';
        } else {
          this.step = 'reset';
        }
        this.cdr.markForCheck();
      },
      error: err => {
        this.busy = false;
        this.error = err?.error?.detail || err?.message || 'Incorrect code. Please try again.';
        this.cdr.markForCheck();
      },
    });
  }

  private savePassword(): void {
    if (!this.newPassword) {
      this.error = 'Please choose a new password.';
      this.cdr.markForCheck();
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.error = 'The two passwords do not match.';
      this.cdr.markForCheck();
      return;
    }
    this.busy = true;
    this.error = '';
    this.cdr.markForCheck();

    this.apiService.resetPasswordWithToken(this.resetToken, this.newPassword).subscribe({
      next: () => {
        this.busy = false;
        this.step = 'done';
        this.resetComplete.emit(this.email.trim());
        this.cdr.markForCheck();
      },
      error: err => {
        this.busy = false;
        this.error = err?.error?.detail || err?.message || 'Could not reset the password. Please try again.';
        this.cdr.markForCheck();
      },
    });
  }
}
