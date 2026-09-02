import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-member-profile-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './member-profile-modal.component.html',
  styleUrl: './member-profile-modal.component.scss',
})
export class MemberProfileModalComponent {
  @Input() member: any = null;
  @Input() schoolName = '';

  @Output() close = new EventEmitter<void>();

  getInitials(fullName: string): string {
    if (!fullName) return '?';
    return fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  }

  onClose(): void {
    this.close.emit();
  }
}