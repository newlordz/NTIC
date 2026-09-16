import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-social-share',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './social-share.component.html',
  styleUrl: './social-share.component.scss'
})
export class SocialShareComponent {
  @Input() title: string = '';
  @Input() summary: string = '';
  @Input() url: string = '';
  @Input() compact: boolean = false;

  copied: boolean = false;
  private copyTimeout: any;

  get shareUrl(): string {
    if (this.url) {
      if (this.url.startsWith('http://') || this.url.startsWith('https://')) {
        return this.url;
      }
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      return `${origin}${this.url.startsWith('/') ? '' : '/'}${this.url}`;
    }
    return typeof window !== 'undefined' ? window.location.href : '';
  }

  get canNativeShare(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.share;
  }

  async shareNative(): Promise<void> {
    if (!this.canNativeShare) return;
    try {
      await navigator.share({
        title: this.title,
        text: this.summary,
        url: this.shareUrl
      });
    } catch {
      // User aborted share sheet
    }
  }

  shareWhatsApp(event?: MouseEvent): void {
    event?.stopPropagation();
    const text = `${this.title}\n\n${this.summary ? this.summary + '\n\n' : ''}${this.shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }

  shareX(event?: MouseEvent): void {
    event?.stopPropagation();
    window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(this.title)}&url=${encodeURIComponent(this.shareUrl)}`, '_blank', 'noopener,noreferrer');
  }

  shareLinkedIn(event?: MouseEvent): void {
    event?.stopPropagation();
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(this.shareUrl)}`, '_blank', 'noopener,noreferrer');
  }

  shareFacebook(event?: MouseEvent): void {
    event?.stopPropagation();
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(this.shareUrl)}`, '_blank', 'noopener,noreferrer');
  }

  copyLink(event?: MouseEvent): void {
    event?.stopPropagation();
    const text = this.shareUrl;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => this.triggerCopiedState());
    } else {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        this.triggerCopiedState();
      } catch {
        // clipboard failure
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  private triggerCopiedState(): void {
    this.copied = true;
    clearTimeout(this.copyTimeout);
    this.copyTimeout = setTimeout(() => {
      this.copied = false;
    }, 2000);
  }
}
