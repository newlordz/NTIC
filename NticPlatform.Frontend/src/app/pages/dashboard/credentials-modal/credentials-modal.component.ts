import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-credentials-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './credentials-modal.component.html',
  styleUrls: ['./credentials-modal.component.scss']
})
export class CredentialsModalComponent {
  @Input() modal: any = null;
  @Output() proceed = new EventEmitter<void>();

  onProceed(): void {
    this.proceed.emit();
  }

  copyText(type: 'pass' | 'pin' | 'all'): void {
    if (!this.modal) return;
    let textToCopy = '';
    if (type === 'pass') {
      textToCopy = this.modal.accessPass || '';
      this.modal.copiedPass = true;
      setTimeout(() => { if (this.modal) this.modal.copiedPass = false; }, 2500);
    } else if (type === 'pin') {
      textToCopy = this.modal.pin || '';
      this.modal.copiedPin = true;
      setTimeout(() => { if (this.modal) this.modal.copiedPin = false; }, 2500);
    } else if (type === 'all') {
      const pinPart = this.modal.pin ? `\nPIN / OTP: ${this.modal.pin}` : '';
      textToCopy = `Access Pass: ${this.modal.accessPass || ''}${pinPart}`;
      this.modal.copiedAll = true;
      setTimeout(() => { if (this.modal) this.modal.copiedAll = false; }, 2500);
    }
    this.writeToClipboard(textToCopy);
  }

  copyMembers(): void {
    if (!this.modal?.memberCredentials?.length) return;
    const lines = (this.modal.memberCredentials || [])
      .map((m: any) => {
        const name = m.name || m.email || 'Member';
        const otp = m.temporary_password || '';
        const ticket = m.ticket || '';
        return `${name} | ${m.email || ''} | Pass: ${ticket} | OTP: ${otp}`;
      })
      .join('\n');
    this.writeToClipboard(lines);
    this.modal.copiedMembers = true;
    setTimeout(() => {
      if (this.modal) this.modal.copiedMembers = false;
    }, 2500);
  }

  private writeToClipboard(text: string): void {
    if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {
        this.fallbackCopy(text);
      });
    } else {
      this.fallbackCopy(text);
    }
  }

  private fallbackCopy(text: string): void {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch {}
  }
}
