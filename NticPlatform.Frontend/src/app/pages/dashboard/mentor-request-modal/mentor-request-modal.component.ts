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
  suggestStep = 1;

  suggestedForm = {
    name: '',
    email: '',
    phone: '',
    organization: '',
    expertise: '',
    bio: ''
  };

  setTab(newTab: 'pool' | 'suggest'): void {
    this.tab = newTab;
    if (newTab === 'suggest') {
      this.suggestStep = 1;
    }
  }

  nextStep(): void {
    if (this.suggestStep === 1) {
      if (!this.canProceedStep1()) return;
    }
    if (this.suggestStep < 3) {
      this.suggestStep++;
    }
  }

  prevStep(): void {
    if (this.suggestStep > 1) {
      this.suggestStep--;
    }
  }

  canProceedStep1(): boolean {
    const name = (this.suggestedForm.name || '').trim();
    const email = (this.suggestedForm.email || '').trim();
    return name.length > 0 && email.length > 0 && email.includes('@');
  }

  onClose(): void {
    this.suggestStep = 1;
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
