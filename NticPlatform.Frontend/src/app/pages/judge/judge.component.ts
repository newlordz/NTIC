import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import type { JudgeQueue, JudgeHistory, JudgeSubmission } from '../../services/api.service';
import { ContentService, Competition } from '../../services/content.service';
import { DialogService } from '../../services/dialog.service';
import { getAuthValue } from '../../services/session.util';

export interface RubricCriterion {
  id: string;
  name: string;
  weight: number; // e.g. 0.40 for 40%
  score: number;  // 0 - 100
  maxScore: number;
  description: string;
  icon: string;
}

export interface TrackImpactMetric {
  track: string;
  label: string;
  icon: string;
  competitionsCount: number;
  teamsCount: number;
  pendingCount: number;
  gradedCount: number;
  avgScore: number | string;
  stdDev: number | string;
  variance: number | string;
  feedbackPct: number;
  impactLevel: 'Optimal' | 'Active Scoring' | 'Awaiting Entries' | 'Scoring Finalized';
  biasLabel: 'Strict (Low Skew)' | 'Balanced Normal' | 'Lenient (High Skew)' | 'Awaiting Data';
  biasClass: string;
  accentColor: string;
  distribution: { range: string; count: number; pct: number }[];
  recommendation: string;
}

/**
 * The Observatory: Centralized competition monitoring, evaluation queue,
 * statistical scoring calibration, and judges' impact telemetry.
 */
@Component({
  selector: 'app-judge',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './judge.component.html',
  styleUrl: './judge.component.scss'
})
export class JudgeComponent implements OnInit {
  queue: JudgeQueue | null = null;
  history: JudgeHistory | null = null;
  competitions: Competition[] = [];

  loading = false;
  loadError = '';
  trackFilter = '';
  searchQuery = '';
  selectedTrackFilter = '';
  selectedStatusFilter = '';

  /**
   * Restricts the evaluation queue to one competition cycle. Empty means every
   * cycle, which is the historical behaviour.
   *
   * Scoped server-side via `?competition_id=` so the queue and its counts are
   * filtered together -- filtering only the list would leave the pending badge
   * reporting a platform-wide total that disagreed with what is on screen.
   */
  cycleFilter = '';

  /** View switcher: Competitions Observatory, Evaluation Queue, Scoring Archive */
  view: 'competitions' | 'queue' | 'history' = 'competitions';

  /** The entry open in the scoring pane. */
  active: JudgeSubmission | null = null;
  scoreInput: number | null = null;
  feedbackInput = '';
  saving = false;
  saveError = '';
  alreadyScoredWarning = '';
  revising = false;

  /** Multi-Criteria Weighted Rubric Scoring Mode */
  useRubricScoring = false;
  rubricCriteria: RubricCriterion[] = [
    {
      id: 'tech',
      name: 'Technical Execution & Correctness',
      weight: 0.40,
      score: 85,
      maxScore: 100,
      description: 'Algorithmic efficiency, execution completeness, and problem-solving depth',
      icon: 'terminal'
    },
    {
      id: 'inno',
      name: 'Innovation & Creative Originality',
      weight: 0.30,
      score: 80,
      maxScore: 100,
      description: 'Novelty of approach, creative engineering, and distinction from existing tools',
      icon: 'lightbulb'
    },
    {
      id: 'arch',
      name: 'System Architecture & Code Quality',
      weight: 0.20,
      score: 85,
      maxScore: 100,
      description: 'Modularity, clean code conventions, security considerations, and scalability',
      icon: 'account_tree'
    },
    {
      id: 'pres',
      name: 'Documentation & Demo Clarity',
      weight: 0.10,
      score: 90,
      maxScore: 100,
      description: 'Quality of README, demo video presentation, and usability walkthrough',
      icon: 'description'
    }
  ];

  /** Modal state for deep statistical calibration inspection */
  selectedCalibrationTrack: TrackImpactMetric | null = null;

  /** Modal state for detailed competition overview inspection */
  selectedCompetitionModal: Competition | null = null;

  readonly maxScore = 100;

  constructor(
    private apiService: ApiService,
    public contentService: ContentService,
    private dialogService: DialogService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.refresh();
  }

  get judgeName(): string {
    return getAuthValue('activeUserName') || 'Observatory Lead';
  }

  refresh(): void {
    this.loading = true;
    this.loadError = '';

    // 1. Load Live Queue
    this.apiService.getJudgeQueue(this.trackFilter, this.cycleFilter).subscribe({
      next: q => {
        this.queue = q;
        this.loading = false;
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

    // 2. Load Graded History
    this.apiService.getJudgeHistory().subscribe({
      next: h => {
        this.history = h;
        this.cdr.detectChanges();
      },
      error: () => { /* history error is secondary */ },
    });

    // 3. Load Competitions for Observatory Monitoring
    this.loadCompetitions();
  }

  loadCompetitions(): void {
    this.apiService.getCompetitions().subscribe({
      next: (comps: any[]) => {
        if (Array.isArray(comps) && comps.length > 0) {
          this.competitions = comps;
        } else if (this.contentService.competitions && this.contentService.competitions.length > 0) {
          this.competitions = this.contentService.competitions;
        } else {
          this.competitions = [];
        }
        this.cdr.detectChanges();
      },
      error: () => {
        if (this.contentService.competitions && this.contentService.competitions.length > 0) {
          this.competitions = this.contentService.competitions;
        } else {
          this.competitions = [];
        }
        this.cdr.detectChanges();
      }
    });
  }

  // ── Metrics & Statistical Aggregations ───────────────────────────────

  get filteredCompetitions(): Competition[] {
    return this.competitions.filter(c => {
      const title = (c.title || '').toLowerCase();
      const track = (c.track || '').toLowerCase();
      const description = (c.description || '').toLowerCase();
      const status = (c.status || '').toLowerCase();

      const matchesSearch = !this.searchQuery.trim() ||
        title.includes(this.searchQuery.toLowerCase()) ||
        description.includes(this.searchQuery.toLowerCase()) ||
        track.includes(this.searchQuery.toLowerCase());

      const matchesTrack = !this.selectedTrackFilter ||
        track === this.selectedTrackFilter.toLowerCase();

      const matchesStatus = !this.selectedStatusFilter ||
        status === this.selectedStatusFilter.toLowerCase();

      return matchesSearch && matchesTrack && matchesStatus;
    });
  }

  get totalTeamsMonitored(): number {
    return this.competitions.reduce((acc, c) => acc + (c.teams || 0), 0);
  }

  get totalPendingCount(): number {
    return this.queue?.pending_total ?? 0;
  }

  get totalEvaluatedCount(): number {
    return this.history?.graded_total ?? 0;
  }

  get averageScoreLabel(): string {
    const avg = this.history?.average_score;
    return (avg !== null && avg !== undefined) ? `${avg}/100` : '—';
  }

  get feedbackCoveragePct(): number {
    if (!this.history || !this.history.graded.length) return 100;
    const withFeedback = this.history.graded.filter(g => g.feedback && g.feedback.trim().length > 0).length;
    return Math.round((withFeedback / this.history.graded.length) * 100);
  }

  /**
   * Generates cross-track judge impact & Z-Score statistical calibration intelligence
   */
  get trackImpactMetrics(): TrackImpactMetric[] {
    const canonicalTracks = [
      { key: 'coding', label: 'Coding & Algorithms', icon: 'code', color: '#2563eb' },
      { key: 'ai', label: 'AI & Data Science', icon: 'psychology', color: '#7c3aed' },
      { key: 'robotics', label: 'Robotics & Hardware', icon: 'smart_toy', color: '#059669' },
      { key: 'cyber', label: 'Cybersecurity & CTF', icon: 'security', color: '#dc2626' },
      { key: 'iot', label: 'IoT & CleanTech', icon: 'sensors', color: '#d97706' }
    ];

    return canonicalTracks.map(t => {
      const comps = this.competitions.filter(c => (c.track || '').toLowerCase() === t.key);
      const teams = comps.reduce((acc, c) => acc + (c.teams || 0), 0);
      
      const trackQueuePending = this.queue?.by_track.find(b => (b.track || '').toLowerCase() === t.key)?.pending || 0;
      const gradedInTrack = this.history?.graded.filter(g => (g.track || '').toLowerCase() === t.key) || [];
      const gradedCount = gradedInTrack.length;
      const scores = gradedInTrack.map(g => g.score || 0);

      // Compute real statistics from database submissions
      let avgScore: number | string = '—';
      let stdDev: number | string = '—';
      let variance: number | string = '—';
      let feedbackPct = 0;
      let biasLabel: TrackImpactMetric['biasLabel'] = 'Awaiting Data';
      let biasClass = 'bias-neutral';
      let recommendation = 'No submissions evaluated yet for this track. Real-time calibration will calculate once entries are scored.';
      let distribution = [
        { range: '90-100', count: 0, pct: 0 },
        { range: '75-89', count: 0, pct: 0 },
        { range: '60-74', count: 0, pct: 0 },
        { range: '0-59', count: 0, pct: 0 },
      ];

      if (gradedCount > 0) {
        const mean = scores.reduce((sum, val) => sum + val, 0) / gradedCount;
        const varVal = scores.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / gradedCount;
        const sdVal = Math.sqrt(varVal);

        avgScore = Math.round(mean * 10) / 10;
        stdDev = Math.round(sdVal * 10) / 10;
        variance = Math.round(varVal * 10) / 10;

        const withFb = gradedInTrack.filter(g => g.feedback && g.feedback.trim().length > 0).length;
        feedbackPct = Math.round((withFb / gradedCount) * 100);

        if (mean < 68) {
          biasLabel = 'Strict (Low Skew)';
          biasClass = 'bias-strict';
          recommendation = 'Scores skew strictly below platform baseline. Recommend rubric calibration review with judges.';
        } else if (mean > 88) {
          biasLabel = 'Lenient (High Skew)';
          biasClass = 'bias-lenient';
          recommendation = 'Scores skew heavily lenient. Recommend verifying distinction between top quartile entries.';
        } else {
          biasLabel = 'Balanced Normal';
          biasClass = 'bias-balanced';
          recommendation = 'Scoring distribution adheres to optimal Gaussian bell curve. No calibration adjustment needed.';
        }

        // Real distribution calculation from graded scores
        const b90 = scores.filter(s => s >= 90).length;
        const b75 = scores.filter(s => s >= 75 && s < 90).length;
        const b60 = scores.filter(s => s >= 60 && s < 75).length;
        const b0 = scores.filter(s => s < 60).length;

        distribution = [
          { range: '90-100', count: b90, pct: Math.round((b90 / gradedCount) * 100) },
          { range: '75-89', count: b75, pct: Math.round((b75 / gradedCount) * 100) },
          { range: '60-74', count: b60, pct: Math.round((b60 / gradedCount) * 100) },
          { range: '0-59', count: b0, pct: Math.round((b0 / gradedCount) * 100) },
        ];
      }

      let impactLevel: TrackImpactMetric['impactLevel'] = 'Optimal';
      if (trackQueuePending > 10) {
        impactLevel = 'Active Scoring';
      } else if (trackQueuePending === 0 && gradedCount === 0) {
        impactLevel = 'Awaiting Entries';
      } else if (trackQueuePending === 0 && gradedCount > 0) {
        impactLevel = 'Scoring Finalized';
      }

      return {
        track: t.key,
        label: t.label,
        icon: t.icon,
        competitionsCount: comps.length || 1,
        teamsCount: teams,
        pendingCount: trackQueuePending,
        gradedCount,
        avgScore,
        stdDev,
        variance,
        feedbackPct,
        impactLevel,
        biasLabel,
        biasClass,
        accentColor: t.color,
        distribution,
        recommendation
      };
    });
  }

  // ── Rubric Calculation Logic ─────────────────────────────────────────

  toggleRubricMode(enabled: boolean): void {
    this.useRubricScoring = enabled;
    if (enabled) {
      this.recalculateRubricScore();
    }
  }

  onRubricScoreChange(): void {
    this.recalculateRubricScore();
  }

  recalculateRubricScore(): void {
    const composite = this.rubricCriteria.reduce((sum, c) => sum + (c.score * c.weight), 0);
    this.scoreInput = Math.round(composite);
  }

  applyRubricFeedbackTemplate(): void {
    const lines = this.rubricCriteria.map(c => 
      `• ${c.name} (${Math.round(c.weight * 100)}%): ${c.score}/100`
    );
    const summary = `\n\n[Rubric Breakdown]\n${lines.join('\n')}\nComposite Score: ${this.scoreInput}/100`;
    
    if (!this.feedbackInput.includes('[Rubric Breakdown]')) {
      this.feedbackInput = this.feedbackInput.trim() + summary;
    }
  }

  // ── Calibration Modal Controls ───────────────────────────────────────

  openCalibrationModal(metric: TrackImpactMetric): void {
    this.selectedCalibrationTrack = metric;
  }

  closeCalibrationModal(): void {
    this.selectedCalibrationTrack = null;
  }

  // ── Competition Inspection Modal ─────────────────────────────────────

  inspectCompetition(comp: Competition): void {
    this.selectedCompetitionModal = comp;
  }

  closeCompetitionModal(): void {
    this.selectedCompetitionModal = null;
  }

  // ── Navigation & Evaluation Actions ──────────────────────────────────

  openQueueForTrack(track: string): void {
    this.trackFilter = track;
    this.view = 'queue';
    this.active = null;
    this.refresh();
  }

  /**
   * Jump from a cycle in the Observatory straight to that cycle's queue.
   *
   * Track is cleared deliberately: the intent is "show me everything awaiting a
   * score in this cycle", and keeping a stale track filter would silently hide
   * most of it.
   */
  openQueueForCycle(comp: Competition): void {
    this.cycleFilter = comp.id;
    this.trackFilter = '';
    this.view = 'queue';
    this.active = null;
    this.selectedCompetitionModal = null;
    this.refresh();
  }

  /** Drop the cycle restriction and show the whole platform queue again. */
  clearCycleFilter(): void {
    this.cycleFilter = '';
    this.active = null;
    this.refresh();
  }

  /** Title of the cycle currently scoping the queue, for the UI. */
  get cycleFilterLabel(): string {
    if (!this.cycleFilter) return '';
    return this.competitions.find(c => c.id === this.cycleFilter)?.title ?? 'Selected cycle';
  }

  startEvaluatingTrack(track: string): void {
    this.trackFilter = track;
    this.view = 'queue';
    this.loading = true;
    this.apiService.getJudgeQueue(track, this.cycleFilter).subscribe({
      next: q => {
        this.queue = q;
        this.loading = false;
        if (q.submissions && q.submissions.length > 0) {
          this.open(q.submissions[0]);
        } else {
          this.active = null;
        }
        this.cdr.detectChanges();
      },
      error: err => {
        this.loading = false;
        this.loadError = this.describeError(err, 'judging queue');
        this.cdr.detectChanges();
      }
    });
  }

  setTrack(track: string): void {
    this.trackFilter = track;
    this.active = null;
    this.refresh();
  }

  getTrackIcon(track: string): string {
    const t = (track || '').toLowerCase();
    if (t.includes('code') || t.includes('coding') || t.includes('software')) return 'code';
    if (t.includes('ai') || t.includes('intelligence') || t.includes('ml')) return 'psychology';
    if (t.includes('robot') || t.includes('hardware')) return 'smart_toy';
    if (t.includes('cyber') || t.includes('security') || t.includes('network')) return 'security';
    if (t.includes('iot') || t.includes('sensor') || t.includes('clean')) return 'sensors';
    return 'emoji_events';
  }

  trackLabel(track: string): string {
    return track ? track : 'All Tracks';
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

  get oldestWaitLabel(): string {
    const list = this.queue?.submissions || [];
    if (!list.length) return '';
    return this.submittedAgo(list[0].submitted_at);
  }

  // ── Scoring Pane Logic ───────────────────────────────────────────────

  open(submission: JudgeSubmission, isRevision = false): void {
    this.active = submission;
    this.revising = isRevision;
    this.scoreInput = isRevision ? (submission.score ?? null) : null;
    this.feedbackInput = isRevision ? (submission.feedback || '') : '';
    this.saveError = '';
    this.alreadyScoredWarning = '';

    // Initialize rubric sliders close to existing score or defaults
    const baseline = this.scoreInput ?? 85;
    this.rubricCriteria.forEach(c => {
      c.score = Math.min(100, Math.max(0, baseline));
    });
  }

  artifactIsReachable(s: JudgeSubmission): boolean {
    return !!s.source_is_url || !!s.video_url;
  }

  close(): void {
    this.active = null;
    this.revising = false;
    this.saveError = '';
  }

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

    if (this.useRubricScoring) {
      this.applyRubricFeedbackTemplate();
    }

    if (!this.feedbackInput.trim()) {
      const ok = await this.dialogService.confirm({
        title: 'Submit without feedback?',
        message: `You are giving ${this.active.student_name || 'this entry'} a score of ${this.scoreInput} with no written feedback. Feedback helps students understand their evaluation.`,
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
              ? (err?.error?.detail || 'Another judge has already scored this entry.')
              : err?.status === 422
                ? `Score must be between 0 and ${this.maxScore}.`
                : 'Could not save the score. Nothing was recorded — please try again.';
        this.cdr.detectChanges();
      },
    });
  }

  private describeError(err: any, what: string): string {
    if (err?.status === 403) return `Your role cannot access the ${what}.`;
    if (err?.status === 401) return 'Your session expired. Please sign in again.';
    return `Could not reach the server to load the ${what}.`;
  }
}


