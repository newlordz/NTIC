import { Component, EventEmitter, Input, Output, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-user-ticket-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './user-ticket-modal.component.html',
  styleUrls: ['./user-ticket-modal.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class UserTicketModalComponent {
  @Input() user: any = null;
  @Input() photoUrl: string | null = null;
  @Input() copiedTicket: string | null = null;

  @Output() close = new EventEmitter<void>();
  @Output() copy = new EventEmitter<string>();
  @Output() resetOtp = new EventEmitter<any>();

  onClose(): void {
    this.close.emit();
  }

  onCopy(ticket: string): void {
    this.copy.emit(ticket);
  }

  onResetOtp(user: any): void {
    this.resetOtp.emit(user);
  }

  isMainAdmin(u: any): boolean {
    return u?.email === 'info@nticghana.org' || u?.role === 'super_admin';
  }

  getUserRoleLabel(u: any): string {
    const role = (u?.role || '').toLowerCase();
    switch (role) {
      case 'super_admin': return 'Super Admin';
      case 'admin': return 'Administrator';
      case 'judge': return 'Judge';
      case 'instructor': return 'Instructor';
      case 'mentor': return 'Mentor';
      case 'student': return 'Student';
      case 'sponsor': return 'Sponsor';
      case 'school_admin': return 'School Coordinator';
      default: return u?.role || 'User';
    }
  }
}
