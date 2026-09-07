import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-role-users-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './role-users-modal.component.html',
  styleUrls: ['./role-users-modal.component.scss']
})
export class RoleUsersModalComponent {
  @Input() role: string | null = null;
  @Input() users: any[] = [];
  @Output() close = new EventEmitter<void>();

  onClose(): void {
    this.close.emit();
  }

  getRoleLabel(role: string): string {
    switch (role) {
      case 'super_admin': return 'Super Admin';
      case 'admin': return 'Administrator';
      case 'judge': return 'Judge';
      case 'instructor': return 'Instructor / Mentor';
      case 'student': return 'Student';
      case 'sponsor': return 'Sponsor';
      case 'school_admin': return 'School Coordinator';
      default: return role;
    }
  }

  getInitials(fullName?: string): string {
    if (!fullName) return '?';
    return fullName
      .split(' ')
      .map(n => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  isMainAdmin(user: any): boolean {
    return user?.email === 'info@nticghana.org' || user?.role === 'super_admin';
  }
}
