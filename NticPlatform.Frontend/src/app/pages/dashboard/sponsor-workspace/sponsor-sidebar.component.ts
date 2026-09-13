import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-sponsor-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './sponsor-sidebar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SponsorSidebarComponent {
  @Input() currentUser: any = null;
  @Output() openPayment = new EventEmitter<void>();

  onOpenPayment(): void {
    this.openPayment.emit();
  }
}
