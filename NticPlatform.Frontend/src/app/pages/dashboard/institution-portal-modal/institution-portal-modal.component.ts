import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-institution-portal-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './institution-portal-modal.component.html',
  styleUrl: './institution-portal-modal.component.scss',
})
export class InstitutionPortalModalComponent {
  @Input() isOpen = false;
  @Input() schoolName = '';
  @Input() loading = false;
  @Input() students: Array<{ id: string; full_name: string; email: string; has_logged_in: boolean; must_change_password: boolean }> = [];
  @Input() issuedCredentials: { full_name: string; email: string; temporary_password: string } | null = null;

  @Output() close = new EventEmitter<void>();
  @Output() dismissCredentials = new EventEmitter<void>();
  @Output() resetCredentials = new EventEmitter<{ id: string; full_name: string }>();

  onClose(): void {
    this.close.emit();
  }

  onDismissCredentials(): void {
    this.dismissCredentials.emit();
  }

  onResetCredentials(student: { id: string; full_name: string }): void {
    this.resetCredentials.emit(student);
  }
}