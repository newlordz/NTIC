import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-enlist-squad-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './enlist-squad-modal.component.html',
  styleUrls: ['./enlist-squad-modal.component.scss']
})
export class EnlistSquadModalComponent {
  @Input() isOpen = false;
  @Input() isSubmitting = false;
  @Input() editingTeamOriginalName: string | null = null;
  @Input() teamForm: any = null;
  @Input() additionalMemberIndices: number[] = [];
  @Input() schoolInstructors: any[] = [];

  @Output() close = new EventEmitter<void>();
  @Output() submit = new EventEmitter<void>();
  @Output() selectSize = new EventEmitter<number>();

  onClose(): void {
    this.close.emit();
  }

  onSubmit(): void {
    this.submit.emit();
  }

  onSelectSize(size: number): void {
    this.selectSize.emit(size);
  }
}
