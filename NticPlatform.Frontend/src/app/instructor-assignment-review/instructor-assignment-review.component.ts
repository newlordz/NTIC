import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Subject, Observable, of } from 'rxjs';
import { takeUntil, tap, delay } from 'rxjs/operators';

export interface SubmissionModel {
  id: string;
  studentId: string;
  sourceCodePath: string;
  videoUrl: string;
  track: string;
  status: string;
}

@Component({
  selector: 'app-instructor-assignment-review',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './instructor-assignment-review.component.html',
  styleUrls: ['./instructor-assignment-review.component.scss']
})
export class InstructorAssignmentReviewComponent implements OnInit, OnDestroy {
  public reviewForm!: FormGroup;
  public activeSubmission$!: Observable<SubmissionModel>;
  private destroy$ = new Subject<void>();
  public currentSubmissionId: string | null = null;

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.initForm();
    
    // Declarative RxJS stream simulating fetching incoming assignments from LMS Context
    this.activeSubmission$ = this.mockPendingSubmission().pipe(
      takeUntil(this.destroy$),
      tap(submission => {
        if (submission) {
          this.currentSubmissionId = submission.id;
          this.reviewForm.reset();
        }
      })
    );
  }

  private initForm(): void {
    this.reviewForm = this.fb.group({
      score: ['', [Validators.required, Validators.min(0), Validators.max(100)]],
      feedback: ['', [Validators.required, Validators.minLength(10)]]
    });
  }

  public onSubmitDecision(decision: 'Approve' | 'Request Resubmission'): void {
    if (this.reviewForm.invalid || !this.currentSubmissionId) return;

    const reviewData = {
      ...this.reviewForm.value,
      status: decision === 'Approve' ? 'Approved' : 'NeedsResubmission'
    };

    console.log(`Submitting decision to LMS API via MediatR Commands:`, reviewData);
    alert(`Decision: ${decision} recorded for submission ${this.currentSubmissionId}.`);
    
    // Clear and fetch next tenant-isolated record
    this.reviewForm.reset();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Mocking the backend service for demonstration
  private mockPendingSubmission(): Observable<SubmissionModel> {
    return of({
      id: 'sub-9842',
      studentId: 'STU-9921',
      sourceCodePath: '/repos/robotics/line_follower_v2.cpp',
      videoUrl: 'https://video.nticportal.local/demo_9921.mp4',
      track: 'Robotics',
      status: 'Pending Review'
    }).pipe(delay(500));
  }
}
