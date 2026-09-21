import { Component, Input, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-social-share',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './social-share.component.html',
  styleUrl: './social-share.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SocialShareComponent {
  @Input() title: string = '';
  @Input() summary: string = '';
  @Input() url: string = '';
  @Input() image: string = '';
  @Input() compact: boolean = false;
  @Input() showPreviewCard: boolean = false;

  copied: boolean = false;
  private copyTimeout: any;

  constructor(private cdr: ChangeDetectorRef) {}

  get summaryTeaser(): string {
    if (!this.summary) return '';
    const clean = this.summary.replace(/\s+/g, ' ').trim();
    return clean.length > 140 ? clean.slice(0, 137) + '...' : clean;
  }

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

  /**
   * Returns a publicly linkable URL with a valid public TLD.
   * WhatsApp, Telegram, Facebook, and Twitter disable clickable hyperlinks for 'localhost'
   * and cannot scrape 'localhost' for OpenGraph thumbnails.
   * In local development, we resolve the host to the platform's production domain (ntic.org.gh)
   * so that links are immediately recognized as clickable blue hyperlinks and card previews generate.
   */
  get publicShareUrl(): string {
    const url = this.shareUrl;
    try {
      const parsed = new URL(url);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        parsed.protocol = 'https:';
        parsed.host = 'ntic.org.gh';
        return parsed.toString();
      }
    } catch {}
    return url;
  }

  get displayDomain(): string {
    try {
      const parsed = new URL(this.publicShareUrl);
      return parsed.hostname;
    } catch {
      return 'ntic.org.gh';
    }
  }

  get canNativeShare(): boolean {
    if (typeof navigator === 'undefined' || !navigator.share) return false;
    // Strictly show on mobile/tablet devices where Web Share API is robust and expected
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  }

  get whatsAppUrl(): string {
    const teaser = this.summaryTeaser;
    const text = `*${this.title.trim()}*\n\n${teaser ? teaser + '\n\n' : ''}👉 Read story: ${this.publicShareUrl}`;
    return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  }

  get xUrl(): string {
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(this.title)}&url=${encodeURIComponent(this.publicShareUrl)}`;
  }

  get linkedInUrl(): string {
    return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(this.publicShareUrl)}`;
  }

  get facebookUrl(): string {
    return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(this.publicShareUrl)}`;
  }

  async shareNative(event?: Event): Promise<void> {
    event?.stopPropagation();
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        const shareData: any = {
          title: this.title,
          text: this.summaryTeaser ? `${this.title}\n\n${this.summaryTeaser}` : this.title,
          url: this.publicShareUrl
        };

        // If thumbnail image is present, attempt to attach the file directly to the share sheet
        if (this.image && typeof fetch === 'function') {
          try {
            const resp = await fetch(this.image, { mode: 'cors' });
            if (resp.ok) {
              const blob = await resp.blob();
              const ext = blob.type.split('/')[1] || 'jpg';
              const file = new File([blob], `ntic-preview.${ext}`, { type: blob.type || 'image/jpeg' });
              if (navigator.canShare && navigator.canShare({ files: [file] })) {
                shareData.files = [file];
              }
            }
          } catch {
            // Fallback cleanly to url/text sharing
          }
        }

        await navigator.share(shareData);
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return; // User cancelled share sheet
      }
    }
    // Fallback to copy link if native share is not supported or fails
    this.copyLink(event);
  }

  copyLink(event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    const text = this.publicShareUrl;

    const fallbackCopy = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '-9999px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        this.triggerCopiedState();
      } catch (e) {
        console.error('Fallback copy failed', e);
      }
    };

    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => this.triggerCopiedState())
        .catch(() => fallbackCopy());
    } else {
      fallbackCopy();
    }
  }

  private triggerCopiedState(): void {
    this.copied = true;
    this.cdr.markForCheck();
    clearTimeout(this.copyTimeout);
    this.copyTimeout = setTimeout(() => {
      this.copied = false;
      this.cdr.markForCheck();
    }, 2000);
  }
}
