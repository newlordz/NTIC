import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ElementRef,
  ViewChild,
  HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';
import { ApiService } from '../../services/api.service';
import { ContentService, Submission } from '../../services/content.service';

export interface InstructorSubmission {
  id: string;
  backendId?: string;
  student: string;
  avatar: string;
  school: string;
  assignment: string;
  track: string;
  file: string;
  status: 'pending' | 'approved' | 'resubmission';
  time: string;
  codeSnippet: string;
  priority: 'high' | 'normal';
}

export interface InstructorCourse {
  title: string;
  track: string;
  icon: string;
  level: string;
  enrolled: number;
  completion: number;
  modules: number;
  pendingReviews: number;
}

@Component({
  selector: 'app-instructor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './instructor.component.html',
  styleUrl: './instructor.component.scss',
  animations: [
    trigger('tabFade', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(16px)' }),
        animate('400ms cubic-bezier(0.16, 1, 0.3, 1)', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(-8px)' }))
      ])
    ]),
    trigger('panelSlide', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(24px)' }),
        animate('500ms cubic-bezier(0.16, 1, 0.3, 1)', style({ opacity: 1, transform: 'translateX(0)' }))
      ])
    ]),
    trigger('listStagger', [
      transition('* => *', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateX(-12px)' }),
          stagger(60, [
            animate('400ms cubic-bezier(0.16, 1, 0.3, 1)', style({ opacity: 1, transform: 'translateX(0)' }))
          ])
        ], { optional: true })
      ])
    ]),
    trigger('toastPop', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(20px) scale(0.95)' }),
        animate('400ms cubic-bezier(0.34, 1.56, 0.64, 1)', style({ opacity: 1, transform: 'translateY(0) scale(1)' }))
      ]),
      transition(':leave', [
        animate('250ms ease-in', style({ opacity: 0, transform: 'translateY(-10px) scale(0.98)' }))
      ])
    ])
  ]
})
export class InstructorComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('heroCanvas') heroCanvas?: ElementRef<HTMLCanvasElement>;

  activeTab: 'grading' | 'courses' | 'mentorship' = 'grading';
  selectedSubmission: InstructorSubmission | null = null;
  reviewScore = 0;
  reviewFeedback = '';
  showSuccessToast = false;
  toastMessage = '';
  trackFilter = 'all';
  mouseX = 0;
  mouseY = 0;

  animatedStats = { pending: 0, reviewed: 0, students: 0, courses: 0 };
  private statTargets = { pending: 0, reviewed: 0, students: 0, courses: 0 };
  private animFrame?: number;
  private canvasAnim?: number;
  private toastTimer?: ReturnType<typeof setTimeout>;

  tabs = [
    { id: 'grading' as const, label: 'Grading Queue', icon: 'assignment_turned_in', badge: 42 },
    { id: 'courses' as const, label: 'My Courses', icon: 'library_books', badge: 0 },
    { id: 'mentorship' as const, label: 'Team Mentorship', icon: 'groups', badge: 6 }
  ];

  submissions: InstructorSubmission[] = [];

  courses: InstructorCourse[] = [];

  mentoredTeams: any[] = [];

  activityFeed: any[] = [];

  constructor(private apiService: ApiService, private contentService: ContentService) {}

  ngOnInit(): void {
    this.loadSubmissions();
    this.loadCourses();
    this.loadMentoredTeams();
    this.updateStats();
    this.buildActivityFeed();
    this.animateCounters();
    const firstPending = this.submissions.find(s => s.status === 'pending');
    if (firstPending) this.selectSubmission(firstPending);
  }

  // ── Data Loading (real data first, demo fallback) ──────────────

  private loadSubmissions(): void {
    const localSubs = this.contentService.submissions;
    if (localSubs && localSubs.length > 0) {
      this.submissions = localSubs.map(s => this.mapLocalSubmission(s));
    }

    this.apiService.getStudents().subscribe({
      next: (students) => {
        this.apiService.getSubmissions().subscribe({
          next: (backendSubs) => {
            if (!backendSubs || backendSubs.length === 0) return;
            const knownIds = new Set(this.submissions.map(s => s.backendId || s.id));
            const extras = backendSubs
              .filter(b => !knownIds.has(b.id))
              .map(b => this.mapBackendSubmission(b, students));
            if (extras.length > 0) {
              this.submissions = [...extras, ...this.submissions];
              this.updateStats();
              this.buildActivityFeed();
              const firstPending = this.submissions.find(s => s.status === 'pending');
              if (firstPending) this.selectSubmission(firstPending);
            }
          },
          error: () => console.log('Backend submissions fallback to local cache')
        });
      },
      error: () => console.log('Backend students fallback to local cache')
    });
  }

  private buildActivityFeed(): void {
    const real = this.submissions.slice(0, 6).map(s => ({
      icon: s.status === 'approved' ? 'task_alt' : 'upload_file',
      text: s.status === 'approved'
        ? `You approved ${s.student}'s submission (${s.file})`
        : `${s.student} submitted ${s.file}`,
      time: s.time,
      track: s.track
    }));
    if (real.length > 0) this.activityFeed = real;
  }

  private mapLocalSubmission(s: Submission): InstructorSubmission {
    const name = s.student || 'Student';
    return {
      id: s.id,
      backendId: s.backendId || s.id,
      student: name,
      avatar: this.initials(name),
      school: s.school || 'NTIC Member Institution',
      assignment: s.assignment || 'Assignment Submission',
      track: this.normalizeTrack(s.track || 'Coding'),
      file: this.displayFile(s.file || ''),
      status: this.mapStatus(s.status),
      time: this.relativeTime(s.time || ''),
      codeSnippet: this.snippetFor(s),
      priority: s.status === 'pending' ? 'high' : 'normal'
    };
  }

  private mapBackendSubmission(b: any, students: any[]): InstructorSubmission {
    const student = students.find(s => s.id === b.student_id);
    const name = student ? `${student.first_name || ''} ${student.last_name || ''}`.trim() : 'Student';
    const file = b.source_code_path || b.video_url || 'submission';
    const status = this.mapStatus(b.status);
    return {
      id: b.id,
      backendId: b.id,
      student: name || 'Student',
      avatar: this.initials(name || 'Student'),
      school: 'NTIC Member Institution',
      assignment: file,
      track: this.normalizeTrack(student?.track || 'Coding'),
      file: file,
      status,
      time: this.relativeTime(b.created_at),
      codeSnippet: this.snippetForFile(file),
      priority: status === 'pending' ? 'high' : 'normal'
    };
  }

  private loadCourses(): void {
    const real = this.contentService.lmsCourses
      .filter(c => c.status === 'active' && (c.approvalStatus || 'approved') === 'approved')
      .map(c => ({
        title: c.title,
        track: this.normalizeTrack(c.track),
        icon: c.icon || 'menu_book',
        level: c.level || 'Beginner',
        enrolled: c.enrolled || 0,
        completion: c.completion || 0,
        modules: c.modules || 0,
        pendingReviews: this.submissions.filter(s => s.track === this.normalizeTrack(c.track) && s.status === 'pending').length
      }));
    if (real.length > 0) this.courses = real;
  }

  private loadMentoredTeams(): void {
    const real = this.contentService.teams.map(t => ({
      name: t.name,
      track: this.normalizeTrack(t.track),
      school: t.schoolName || 'NTIC Member Institution',
      progress: this.teamProgress(t.status),
      nextDeadline: this.teamDeadline(t.status),
      members: t.members || 1,
      status: this.teamHealth(t.status)
    }));
    if (real.length > 0) this.mentoredTeams = real;
  }

  private updateStats(): void {
    const pending = this.pendingCount;
    const reviewed = this.submissions.filter(s => s.status === 'approved').length;
    const students = this.contentService.users.filter(u => u.role === 'student').length;
    const courses = this.courses.length;
    this.statTargets = {
      pending: pending || 1,
      reviewed: reviewed || 1,
      students: students || 1,
      courses: courses || 1
    };
    this.tabs[0].badge = pending;
    this.tabs[2].badge = this.mentoredTeams.length;
  }

  // ── Mapping Helpers ────────────────────────────────────────────

  private normalizeTrack(track: string): string {
    const t = (track || '').toLowerCase();
    if (t.includes('robot') || t.includes('iot') || t.includes('hardware')) return 'robotics';
    if (t.includes('cyber') || t.includes('security') || t.includes('hack')) return 'cyber';
    if (t === 'ai' || t.includes('intelligence') || t.includes('learning') || t.includes('machine')) return 'ai';
    if (t.includes('innov') || t.includes('design')) return 'innovation';
    if (t.includes('web') || t.includes('mobile') || t.includes('dev')) return 'coding';
    return 'coding';
  }

  private mapStatus(status: string): InstructorSubmission['status'] {
    const s = (status || '').toLowerCase();
    if (s === 'approved' || s === 'graded' || s === 'scored' || s.includes('approve')) return 'approved';
    if (s === 'resubmission' || s === 'needsresubmission' || s.includes('resubmit')) return 'resubmission';
    return 'pending';
  }

  private initials(name: string): string {
    const parts = (name || '?').trim().split(/\s+/);
    const first = parts[0]?.charAt(0) || '';
    const last = parts.length > 1 ? parts[1].charAt(0) : '';
    return (first + last).toUpperCase() || '?';
  }

  private displayFile(file: string): string {
    if (!file) return 'submission';
    return file.split('||').map((f: string) => (f.includes('::') ? f.split('::')[1] : f)).join(', ');
  }

  private relativeTime(input: string): string {
    if (!input) return 'just now';
    const t = new Date(input).getTime();
    if (isNaN(t)) return 'just now';
    const diff = Date.now() - t;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  private snippetFor(s: Submission): string {
    const file = this.displayFile(s.file || '');
    return `// ${s.assignment || 'Assignment submission'}\n// Submitted file: ${file}\n// Full source preview not available for uploaded files.`;
  }

  private snippetForFile(file: string): string {
    return `// ${file}\n// Source preview not available for uploaded files.`;
  }

  private teamProgress(status: string): number {
    const s = (status || '').toLowerCase();
    if (s === 'qualified' || s === 'approved' || s === 'active') return 70;
    if (s === 'pending' || s === 'registration') return 30;
    if (s === 'champion') return 95;
    return 15;
  }

  private teamDeadline(status: string): string {
    const s = (status || '').toLowerCase();
    if (s === 'qualified' || s === 'approved' || s === 'active') return 'Aug 2026';
    return 'TBD';
  }

  private teamHealth(status: string): string {
    const s = (status || '').toLowerCase();
    if (s === 'qualified' || s === 'approved' || s === 'active') return 'on-track';
    if (s === 'pending' || s === 'registration') return 'needs-attention';
    if (s === 'champion') return 'excellent';
    return 'at-risk';
  }

  ngAfterViewInit(): void {
    this.initHeroParticles();
  }

  ngOnDestroy(): void {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    if (this.canvasAnim) cancelAnimationFrame(this.canvasAnim);
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  @HostListener('mousemove', ['$event'])
  onMouseMove(e: MouseEvent): void {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
  }

  get filteredSubmissions(): InstructorSubmission[] {
    if (this.trackFilter === 'all') return this.submissions;
    return this.submissions.filter(s => s.track === this.trackFilter);
  }

  get pendingCount(): number {
    return this.submissions.filter(s => s.status === 'pending').length;
  }

  selectSubmission(sub: InstructorSubmission): void {
    this.selectedSubmission = sub;
    this.reviewScore = sub.status === 'approved' ? 88 : 0;
    this.reviewFeedback = '';
  }

  setTab(tab: 'grading' | 'courses' | 'mentorship'): void {
    this.activeTab = tab;
  }

  setTrackFilter(track: string): void {
    this.trackFilter = track;
  }

  approveSubmission(): void {
    if (!this.selectedSubmission || !this.reviewScore) return;
    this.selectedSubmission.status = 'approved';
    this.selectedSubmission.priority = 'normal';
    this.contentService.syncGradeToBackend(this.selectedSubmission.id, {
      score: this.reviewScore,
      feedback: this.reviewFeedback,
      status: 'approved'
    });
    this.updateLocalSubmission({
      score: this.reviewScore,
      feedback: this.reviewFeedback,
      status: 'approved'
    });
    this.updateStats();
    this.showToast(`Approved ${this.selectedSubmission.student} — Score: ${this.reviewScore}/100`);
    this.advanceQueue();
  }

  requestResubmission(): void {
    if (!this.selectedSubmission) return;
    this.selectedSubmission.status = 'resubmission';
    this.selectedSubmission.priority = 'normal';
    this.contentService.syncGradeToBackend(this.selectedSubmission.id, {
      feedback: this.reviewFeedback,
      status: 'resubmission'
    });
    this.updateLocalSubmission({
      feedback: this.reviewFeedback,
      status: 'resubmission'
    });
    this.updateStats();
    this.showToast(`Resubmission requested for ${this.selectedSubmission.student}`);
    this.advanceQueue();
  }

  private updateLocalSubmission(updates: { score?: number; feedback?: string; status?: Submission['status'] }): void {
    const subs = [...this.contentService.submissions];
    const idx = subs.findIndex(s => s.id === this.selectedSubmission?.id);
    if (idx !== -1) {
      subs[idx] = {
        ...subs[idx],
        ...updates,
        time: new Date().toISOString()
      };
      this.contentService.saveSubmissions(subs);
    }
  }

  private advanceQueue(): void {
    const next = this.submissions.find(s => s.status === 'pending' && s.id !== this.selectedSubmission?.id);
    if (next) this.selectSubmission(next);
  }

  private showToast(message: string): void {
    this.toastMessage = message;
    this.showSuccessToast = true;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.showSuccessToast = false), 3200);
  }

  private animateCounters(): void {
    const duration = 1400;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      this.animatedStats = {
        pending: Math.round(this.statTargets.pending * ease),
        reviewed: Math.round(this.statTargets.reviewed * ease),
        students: Math.round(this.statTargets.students * ease),
        courses: Math.round(this.statTargets.courses * ease)
      };
      if (t < 1) this.animFrame = requestAnimationFrame(tick);
    };
    this.animFrame = requestAnimationFrame(tick);
  }

  private initHeroParticles(): void {
    const canvas = this.heroCanvas?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * devicePixelRatio;
      canvas.height = canvas.offsetHeight * devicePixelRatio;
      ctx.scale(devicePixelRatio, devicePixelRatio);
    };
    resize();

    const particles = Array.from({ length: 40 }, () => ({
      x: Math.random() * canvas.offsetWidth,
      y: Math.random() * canvas.offsetHeight,
      r: Math.random() * 2 + 0.5,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      alpha: Math.random() * 0.5 + 0.2
    }));

    const draw = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(133, 246, 229, ${p.alpha})`;
        ctx.fill();
      });

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0, 106, 96, ${0.08 * (1 - dist / 100)})`;
            ctx.stroke();
          }
        }
      }

      this.canvasAnim = requestAnimationFrame(draw);
    };
    draw();
  }

  getScoreRingOffset(): number {
    const circumference = 2 * Math.PI * 54;
    return circumference - (this.reviewScore / 100) * circumference;
  }
}
