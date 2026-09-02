import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-mentor-request-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mentor-request-modal.component.html',
  styleUrl: './mentor-request-modal.component.scss',
})
export class MentorRequestModalComponent {
  @Input() isOpen = false;
  @Input() team: any = null;
  @Input() allInstructors: any[] = [];
  @Input() isSubmitting = false;

  @Output() close = new EventEmitter<void>();
  @Output() submitRequest = new EventEmitter<{
    mode: 'auto_track' | 'existing' | 'suggested';
    mentor_id?: string;
    suggested_name?: string;
    suggested_email?: string;
    suggested_phone?: string;
    suggested_org?: string;
    suggested_expertise?: string;
    suggested_bio?: string;
  }>();

  tab: 'pool' | 'suggest' = 'pool';
  mode: 'auto_track' | 'existing' = 'auto_track';
  selectedInstructorId = '';

  suggestedForm = {
    name: '',
    email: '',
    phone: '',
    organization: '',
    expertise: '',
    bio: ''
  };

  onClose(): void {
    this.close.emit();
  }

  onSubmit(): void {
    if (this.tab === 'pool') {
      if (this.mode === 'existing') {
        this.submitRequest.emit({
          mode: 'existing',
          mentor_id: this.selectedInstructorId
        });
      } else {
        this.submitRequest.emit({ mode: 'auto_track' });
      }
    } else {
      this.submitRequest.emit({
        mode: 'suggested',
        suggested_name: this.suggestedForm.name.trim(),
        suggested_email: this.suggestedForm.email.trim(),
        suggested_phone: this.suggestedForm.phone.trim(),
        suggested_org: this.suggestedForm.organization.trim(),
        suggested_expertise: this.suggestedForm.expertise.trim(),
        suggested_bio: this.suggestedForm.bio.trim()
      });
    }
  }
}
