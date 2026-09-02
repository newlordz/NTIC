import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-record-inspector-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './record-inspector-modal.component.html',
  styleUrl: './record-inspector-modal.component.scss',
})
export class RecordInspectorModalComponent {
  @Input() isOpen = false;
  @Input() record: any = null;

  @Output() close = new EventEmitter<void>();
  @Output() openArchive = new EventEmitter<void>();

  onClose(): void {
    this.close.emit();
  }

  onOpenArchive(): void {
    this.openArchive.emit();
  }
}