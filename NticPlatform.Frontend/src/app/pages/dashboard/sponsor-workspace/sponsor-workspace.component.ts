import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TimeAgoPipe } from '../../../services/time-ago.pipe';
import { Sponsorship, SponsorPayment } from '../../../services/api.service';

@Component({
  selector: 'app-sponsor-workspace',
  standalone: true,
  imports: [CommonModule, RouterLink, TimeAgoPipe],
  templateUrl: './sponsor-workspace.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SponsorWorkspaceComponent {
  @Input() currentUser: any = null;
  @Input() mySponsorships: Sponsorship[] = [];
  @Input() mySponsorPayments: SponsorPayment[] = [];

  @Output() openPayment = new EventEmitter<void>();
  @Output() copy = new EventEmitter<{ text: string; label: string }>();

  get tierName(): string {
    return this.mySponsorships[0]?.tier || this.currentUser?.tier || 'Partner';
  }

  get trackScope(): string {
    return this.currentUser?.track || 'All Competition Tracks';
  }

  get orgName(): string {
    if (this.currentUser?.organization && this.currentUser.organization !== '_pending_profile') {
      return this.currentUser.organization;
    }
    return this.currentUser?.fullName || 'Corporate Partner';
  }

  onCopy(text: string, label: string = 'Copied'): void {
    this.copy.emit({ text, label });
  }

  onOpenPayment(): void {
    this.openPayment.emit();
  }
}
