import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import type { JudgeQueue, JudgeHistory, JudgeSubmission } from '../../services/api.service';
import { DialogService } from '../../services/dialog.service';
import { getAuthValue } from '../../services/session.util';

/**
 * The judging workspace.
 *
 * Context: the `judge` role has always been in the backend's GRADING_ROLES and
 * `PATCH /api/submissions/{id}/grade` has always accepted it -- but nothing in
 * the app let a judge reach a submission. `/judge` redirected to `/dashboard`
 * and the LMS grading screens exclude the role, so a judge could sign in and
 * only browse a leaderboard. This is that missing surface.
 *
 * Two deliberate design points:
 *
 * - The queue is a SHARED pool, not a per-judge assignment list. The schema
 *   holds one score per submission and has no assignment table, so presenting
 *   "your assigned entries" would be fiction. Oldest-first so nothing starves.
 * - Because it is shared, two judges can open the same entry. Submitting a
 *   score refreshes the queue, and `alreadyScoredWarning` tells you when the
 *   entry you were looking at was scored by someone else meanwhile.
 */
@Component({
  selector: 'app-judge',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './judge.component.html',
  styleUrl: './judge.component.scss'
})
export class JudgeComponent implements OnInit {
  queue: JudgeQueue | null = null;
  history: JudgeHistory | null = null;

  loading = false;
  loadError = '';
  trackFilter = '';

  /** The entry open in the scoring pane. */
  active: JudgeSubmission | null = null;
  scoreInput: number | null = null;
  feedbackInput = '';
  saving = false;
  saveError = '';
  alreadyScoredWarning = '';

  view: 'queue' | 'history' = 'queue';

  readonly maxScore = 100;

  constructor(
    private apiService: ApiService,
    private dialogService: DialogService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.refresh();
  }

  get judgeName(): string {
    return getAuthValue('activeUserName') || 'Judge';
  }

  refresh(): void {
    this.loading = true;
    this.loadError = '';
    this.apiService.getJudgeQueue(this.trackFilter).subscribe({
      next: q => {
        this.queue = q;
        this.loading = false;
        // If the entry being scored has been taken by another judge, say so
        // rather than letting the score overwrite theirs silently.
        if (this.active && !q.submissions.some(s => s.id === this.active!.id)) {
          this.alreadyScoredWarning =
            'This entry was scored by another judge while you had it open. Your score was not applied.';
          this.active = null;
        }
        this.cdr.detectChanges();
      },
      error: err => {
        this.loading = false;
        this.loadError = this.describeError(err, 'judging queue');
        this.cdr.detectChanges();
      },
    });

    this.apiService.getJudgeHistory().subscribe({
      next: h => { this.history = h; this.cdr.detectChanges(); },
      error: () => { /* history is secondary; the queue error already shows */ },
    });
  }

  private describeError(err: any, what: string): string {
    if (err?.status === 403) return `Your role cannot access the ${what}.`;
    if (err?.status === 401) return 'Your session expired. Please sign in again.';
    return `Could not reach the server to load the ${what}.`;
  }

  setTrack(track: string): void {
    this.trackFilter = track;
    this.active = null;
    this.refresh();
  }

  /**
   * Opens the scoring pane.
   *
   * Also used to REVISE a mark from the history list. The queue only contains
   * unscored work and history was read-only, so a judge who mistyped a score had no
   * way to correct it. Existing values are pre-filled so a revision starts from what
   * was actually recorded rather than from blank.
   */
  open(submission: JudgeSubmission, isRevision = false): void {
    this.active = submission;
    this.revising = isRevision;
    this.scoreInput = isRevision ? (submission.score ?? null) : null;
    this.feedbackInput = isRevision ? (submission.feedback || '') : '';
    this.saveError = '';
    this.alreadyScoredWarning = '';
  }

  /** True when the open pane is changing an existing mark rather than setting one. */
  revising = false;

  /**
   * Whether the submitted artifact can actually be opened.
   *
   * `source_code_path` is often a bare filename and there is no file-serving
   * endpoint, so it cannot be fetched. The template rendered it as inert text, which
   * reads as a broken link; this lets it say so instead.
   */
  artifactIsReachable(s: JudgeSubmission): boolean {
    return !!s.source_is_url || !!s.video_url;
  }

  close(): void {
    this.active = null;
    this.revising = false;
    this.saveError = '';
  }

  /** A score is required; feedback is not, but is strongly encouraged. */
  get canSubmit(): boolean {
    return (
      !this.saving &&
      this.scoreInput !== null &&
      this.scoreInput >= 0 &&
      this.scoreInput <= this.maxScore
    );
  }

  get scoreOutOfRange(): boolean {
    return this.scoreInput !== null && (this.scoreInput < 0 || this.scoreInput > this.maxScore);
  }

  async submitScore(): Promise<void> {
    if (!this.active || !this.canSubmit) return;

    // Scoring is effectively irreversible from this screen, so confirm when no
    // feedback was written -- a bare number is not much use to a student.
    if (!this.feedbackInput.trim()) {
      const ok = await this.dialogService.confirm({
        title: 'Submit without feedback?',
        message: `You are giving ${this.active.student_name || 'this entry'} a score of ${this.scoreInput} with no written feedback. Feedback helps the student understand the result.`,
        confirmText: 'Submit anyway',
        cancelText: 'Add feedback',
      });
      if (!ok) return;
    }

    this.saving = true;
    this.saveError = '';
    const target = this.active;

    this.apiService.gradeSubmission(target.id, {
      score: this.scoreInput as number,
      feedback: this.feedbackInput.trim(),
    }).subscribe({
      next: () => {
        this.saving = false;
        this.active = null;
        this.scoreInput = null;
        this.feedbackInput = '';
        this.refresh();
      },
      error: err => {
        this.saving = false;
        this.saveError = err?.status === 404
          ? 'That submission no longer exists.'
          : err?.status === 403
            ? 'Your role is not permitted to score submissions.'
            : err?.status === 409
              // Another judge scored it first. Name them so the clash can be
              // resolved, rather than one mark silently replacing the other.
              ? (err?.error?.detail || 'Another judge has already scored this entry.')
              : err?.status === 422
                ? `Score must be between 0 and ${this.maxScore}.`
                : 'Could not save the score. Nothing was recorded — please try again.';
        this.cdr.detectChanges();
      },
    });
  }

  trackLabel(track: string): string {
    return track ? track : 'Unspecified';
  }

  submittedAgo(iso: string | null): string {
    if (!iso) return 'Unknown';
    const then = new Date(iso).getTime();
    if (isNaN(then)) return 'Unknown';
    const mins = Math.floor((Date.now() - then) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  /** Longest-waiting entry, so the judge can see if anything is stalling. */
  get oldestWaitLabel(): string {
    const list = this.queue?.submissions || [];
    if (!list.length) return '';
    return this.submittedAgo(list[0].submitted_at);
  }
}
