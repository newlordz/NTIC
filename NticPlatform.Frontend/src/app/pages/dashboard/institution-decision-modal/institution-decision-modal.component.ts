import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-institution-decision-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './institution-decision-modal.component.html',
  styleUrl: './institution-decision-modal.component.scss',
})
export class InstitutionDecisionModalComponent {
  @Input() isOpen = false;
  @Input() approval: any = null;
  @Input() action: 'approve' | 'reject' = 'approve';
  @Input() isProcessing = false;

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<{
    action: 'approve' | 'reject';
    notes: string;
  }>();

  decisionNotes = '';

  onClose(): void {
    this.close.emit();
  }

  onConfirm(): void {
    this.confirm.emit({
      action: this.action,
      notes: this.decisionNotes.trim()
    });
  }
}
