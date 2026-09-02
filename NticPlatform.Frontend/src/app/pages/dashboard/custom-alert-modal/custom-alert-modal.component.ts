import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-custom-alert-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './custom-alert-modal.component.html',
  styleUrl: './custom-alert-modal.component.scss',
})
export class CustomAlertModalComponent {
  @Input() alert: { isOpen: boolean; title: string; message: string; type: 'success' | 'warning' | 'info' | 'error' } | null = null;
  @Output() dismiss = new EventEmitter<void>();

  onDismiss(): void {
    this.dismiss.emit();
  }
}