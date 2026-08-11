import { getAuthValue } from '../../services/session.util';
import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ElementRef,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ContentService } from '../../services/content.service';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';

export interface JudgeTeam {
  id: string;
  name: string;
  school: string;
  track: string;
  region: string;
  projectTitle: string;
  members: number;
  submittedAt: string;
  status: 'pending' | 'scored' | 'in-progress';
  score?: number;
  avatar: string;
  description: string;
}

export interface RubricCategory {
  id: string;
  label: string;
  icon: string;
  weight: number;
  score: number;
  maxScore: number;
  description: string;
  feedback: string;
}

export interface CompetitionRound {
  id: string;
  name: string;
  track: string;
  teams: number;
  deadline: string;
  status: 'live' | 'upcoming' | 'completed';
}

@Component({
  selector: 'app-judge',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './judge.component.html',
  styleUrl: './judge.component.scss',
  animations: [
    trigger('arenaFade', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.98)' }),
        animate('500ms cubic-bezier(0.16, 1, 0.3, 1)', style({ opacity: 1, transform: 'scale(1)' }))
      ])
    ]),
    trigger('scorePanel', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(30px)' }),
        animate('600ms cubic-bezier(0.16, 1, 0.3, 1)', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('300ms ease-in', style({ opacity: 0, transform: 'translateY(20px)' }))
      ])
    ]),
    trigger('teamCards', [
      transition('* => *', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateY(20px) rotateX(10deg)' }),
          stagger(70, [
            animate('500ms cubic-bezier(0.16, 1, 0.3, 1)', style({ opacity: 1, transform: 'translateY(0) rotateX(0)' }))
          ])
        ], { optional: true })
      ])
    ]),
    trigger('burst', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0)' }),
        animate('600ms cubic-bezier(0.34, 1.56, 0.64, 1)', style({ opacity: 1, transform: 'scale(1)' }))
      ])
    ]),
    trigger('toastSlide', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(100px)' }),
        animate('500ms cubic-bezier(0.16, 1, 0.3, 1)', style({ opacity: 1, transform: 'translateX(0)' }))
      ]),
      transition(':leave', [
        animate('300ms ease-in', style({ opacity: 0, transform: 'translateX(50px)' }))
      ])
    ])
  ]
})
export class JudgeComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('arenaCanvas') arenaCanvas?: ElementRef<HTMLCanvasElement>;

  activeRoundId = '';
  selectedTeam: JudgeTeam | null = null;
  showScoringPanel = false;
  showSuccessBurst = false;
  showToast = false;
  toastMessage = '';
  judgeNotes = '';
  trackFilter = 'all';
  statusFilter: 'all' | 'pending' | 'scored' = 'all';
  cycleFilter = 'all';
  showConfirmPublish = false;

  searchQuery = '';
  sortField: 'name' | 'submittedAt' | 'score' = 'submittedAt';
  sortDir: 'asc' | 'desc' = 'desc';

  // Media preview modal state
  showMediaModal = false;
  mediaModalTitle = '';
  mediaModalType: 'video' | 'pdf' | 'code' = 'video';
  mediaModalUrl = '';

  animatedStats = { pending: 0, scored: 0, rounds: 0, teams: 0 };
  private statTargets = { pending: 17, scored: 84, rounds: 5, teams: 48 };
  private animFrame?: number;
  private canvasAnim?: number;
  private toastTimer?: ReturnType<typeof setTimeout>;

  rubric: RubricCategory[] = [
    { id: 'technical', label: 'Technical Excellence', icon: 'engineering', weight: 30, score: 0, maxScore: 30, description: 'Code quality, algorithm efficiency, system architecture, and correctness of implementation.', feedback: '' },
    { id: 'innovation', label: 'Innovation & Creativity', icon: 'lightbulb', weight: 25, score: 0, maxScore: 25, description: 'Originality of idea, creative problem-solving, and novel approach to the challenge.', feedback: '' },
    { id: 'presentation', label: 'Presentation & Demo', icon: 'present_to_all', weight: 25, score: 0, maxScore: 25, description: 'Clarity of demo, quality of documentation, and effectiveness of project communication.', feedback: '' },
    { id: 'teamwork', label: 'Team Collaboration', icon: 'diversity_3', weight: 20, score: 0, maxScore: 20, description: 'Division of work, team coordination, and evidence of collaborative development.', feedback: '' }
  ];

  get computedRounds(): CompetitionRound[] {
    const teams = this.contentService.teams;
    if (!teams || teams.length === 0) return [];
    
    const trackMetadata: Record<string, { name: string; deadline: string }> = {
      'coding': { name: 'Coding Finals -- Regionals', deadline: 'Jun 28' },
      'robotics': { name: 'Robotics Semi-Finals', deadline: 'Jul 2' },
      'ai & ml': { name: 'AI & ML Bowl', deadline: 'Jul 5' },
      'ai': { name: 'AI & ML Bowl', deadline: 'Jul 5' },
      'cybersecurity': { name: 'Networking & Cybersecurity CTF', deadline: 'Jun 30' },
      'cyber': { name: 'Networking & Cybersecurity CTF', deadline: 'Jun 30' },
      'open innovation': { name: 'Innovation Showcase', deadline: 'Jul 8' },
      'innovation': { name: 'Innovation Showcase', deadline: 'Jul 8' }
    };

    const uniqueTracks = Array.from(new Set(teams.map(t => t.track.toLowerCase())));

    return uniqueTracks.map(track => {
      const meta = trackMetadata[track] || { name: `${track.toUpperCase()} Challenge`, deadline: 'Jul 15' };
      const teamCount = teams.filter(t => t.track.toLowerCase() === track).length;
      
      let standardTrack = track;
      if (track === 'ai & ml') standardTrack = 'ai';
      if (track === 'cybersecurity') standardTrack = 'cyber';
      if (track === 'open innovation') standardTrack = 'innovation';

      return {
        id: `round-${standardTrack}`,
        name: meta.name,
        track: standardTrack,
        teams: teamCount,
        deadline: meta.deadline,
        status: 'live' as const
      };
    });
  }

  get rounds(): CompetitionRound[] {
    return this.computedRounds;
  }

  get teams(): JudgeTeam[] {
    const activeUserEmail = getAuthValue('activeUserEmail') || '';
    const activeUser = this.contentService.users.find(u => u.email === activeUserEmail || u.ticket === activeUserEmail);
    const judgeTrack = activeUser?.track?.toLowerCase() || '';

    let list = this.contentService.submissions;
    if (judgeTrack) {
      list = list.filter(s => s.track.toLowerCase().includes(judgeTrack) || judgeTrack.includes(s.track.toLowerCase()));
    }

    return list.map(s => {
      const matchingTeam = this.contentService.teams.find(t => t.name === s.student);
      return {
        id: s.id,
        name: s.student,
        school: s.school,
        track: s.track.toLowerCase(),
        region: s.school.includes('PRESEC') || s.school.includes('Achimota') ? 'Greater Accra' : s.school.includes('Wesley') ? 'Central' : s.school.includes('Prempeh') ? 'Ashanti' : 'Northern',
        projectTitle: s.assignment,
        members: matchingTeam?.members || 4,
        submittedAt: s.time,
        status: s.score !== null ? 'scored' as const : s.status === 'pending' ? 'pending' as const : 'in-progress' as const,
        score: s.score ?? undefined,
        avatar: s.student.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase(),
        description: `Source code at ${s.file}. Demonstration video at ${s.videoUrl || 'not provided'}.`
      };
    });
  }

  get recentScores(): any[] {
    return this.contentService.submissions
      .filter(s => s.score !== null)
      .map(s => ({
        team: s.student,
        score: s.score,
        track: s.track.toLowerCase(),
        time: s.time
      }));
  }

  constructor(
    public contentService: ContentService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const role = getAuthValue('activeRoleId');
    const email = getAuthValue('activeUserEmail');
    if (role !== 'judge' || !email) {
      this.router.navigate(['/']);
      return;
    }

    const pendingVal = this.teams.filter(t => t.status === 'pending').length;
    const scoredVal = this.teams.filter(t => t.status === 'scored').length;
    const roundsVal = this.rounds.length;
    const teamsVal = this.teams.length;

    this.statTargets = {
      pending: pendingVal,
      scored: scoredVal,
      rounds: roundsVal,
      teams: teamsVal
    };

    if (this.rounds.length > 0 && !this.activeRoundId) {
      this.activeRoundId = this.rounds[0].id;
    }

    this.animateCounters();
  }

  ngAfterViewInit(): void {
    this.initArenaCanvas();
  }

  ngOnDestroy(): void {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    if (this.canvasAnim) cancelAnimationFrame(this.canvasAnim);
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  get activeRound(): CompetitionRound | undefined {
    return this.rounds.find(r => r.id === this.activeRoundId) || this.rounds[0];
  }

  get filteredTeams(): JudgeTeam[] {
    let list = this.teams;

    const round = this.rounds.find(r => r.id === this.activeRoundId);
    if (round) {
      list = list.filter(t => t.track === round.track);
    }

    if (this.trackFilter !== 'all') {
      list = list.filter(t => t.track === this.trackFilter);
    }

    if (this.statusFilter !== 'all') {
      list = list.filter(t => t.status === this.statusFilter);
    }

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.trim().toLowerCase();
      list = list.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.school.toLowerCase().includes(q) ||
        t.projectTitle.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (this.sortField === 'name') cmp = a.name.localeCompare(b.name);
      else if (this.sortField === 'submittedAt') cmp = a.submittedAt.localeCompare(b.submittedAt);
      else if (this.sortField === 'score') cmp = (a.score ?? 0) - (b.score ?? 0);
      return this.sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }

  get totalScore(): number {
    return this.rubric.reduce((sum, r) => sum + r.score, 0);
  }

  get pendingCount(): number {
    return this.teams.filter(t => t.status === 'pending').length;
  }

  get loggedInJudge(): any {
    const activeUserEmail = getAuthValue('activeUserEmail') || '';
    const activeTicket = getAuthValue('activeUserTicket') || '';
    const activeUser = this.contentService.users.find(u => 
      (activeUserEmail && u.email?.toLowerCase() === activeUserEmail.toLowerCase()) ||
      (activeTicket && u.ticket?.toLowerCase() === activeTicket.toLowerCase())
    );
    
    if (activeUser) return activeUser;

    return {
      fullName: activeUserEmail ? activeUserEmail.split('@')[0] : 'Judge Account',
      organization: 'NTI Evaluation Board',
      track: 'General NTI'
    };
  }

  applyRubricPreset(percent: number): void {
    this.rubric.forEach(cat => {
      cat.score = Math.round((cat.maxScore * percent) / 100);
    });
  }

  openMediaPreview(team: JudgeTeam, type: 'video' | 'pdf' | 'code'): void {
    const sub = this.contentService.submissions.find(s => s.id === team.id);
    this.mediaModalTitle = `${team.name} -- ${team.projectTitle}`;
    this.mediaModalType = type;
    
    if (type === 'video') {
      this.mediaModalUrl = sub?.videoUrl || 'https://www.youtube.com';
    } else if (type === 'code') {
      this.mediaModalUrl = sub?.file ? `https://github.com/ntic/repository-${sub.id}` : 'https://github.com/ntic';
    } else {
      this.mediaModalUrl = sub?.file || 'Official Submission PDF Document';
    }
    this.showMediaModal = true;
  }

  closeMediaModal(): void {
    this.showMediaModal = false;
  }

  selectRound(id: string): void {
    this.activeRoundId = id;
    this.closeScoring();
  }

  openScoring(team: JudgeTeam): void {
    this.selectedTeam = team;
    this.showScoringPanel = true;
    this.showConfirmPublish = false;
    this.resetRubric();
    this.judgeNotes = '';

    const sub = this.contentService.submissions.find(s => s.id === team.id);
    if (sub && sub.score !== null) {
      const ratio = sub.score / 100;
      this.rubric.forEach((cat, i) => {
        cat.score = Math.round(cat.maxScore * ratio);
        cat.feedback = '';
      });
      this.judgeNotes = sub.feedback || '';
    }
  }

  navigateTeam(dir: 'prev' | 'next'): void {
    const all = this.filteredTeams;
    if (all.length === 0 || !this.selectedTeam) return;
    const idx = all.findIndex(t => t.id === this.selectedTeam!.id);
    if (idx === -1) return;
    const next = dir === 'next' ? idx + 1 : idx - 1;
    if (next < 0 || next >= all.length) return;
    this.openScoring(all[next]);
  }

  exportScores(): void {
    const scored = this.teams.filter(t => t.status === 'scored');
    if (scored.length === 0) {
      this.showToastMsg('No scored teams to export.');
      return;
    }
    const rows = [
      ['Team', 'School', 'Track', 'Region', 'Score', 'Submitted'],
      ...scored.map(t => [t.name, t.school, t.track, t.region, t.score ?? '', t.submittedAt])
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scores-${this.activeRound?.name?.replace(/\s+/g, '-') || 'export'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.showToastMsg(`Exported ${scored.length} score(s)`);
  }

  closeScoring(): void {
    this.showScoringPanel = false;
    this.selectedTeam = null;
    this.showSuccessBurst = false;
    this.showConfirmPublish = false;
  }

  setRubricScore(category: RubricCategory, value: number): void {
    category.score = Math.min(Math.max(0, value), category.maxScore);
  }

  onSliderInput(category: RubricCategory, event: Event): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    this.setRubricScore(category, val);
  }

  submitScore(): void {
    if (!this.selectedTeam || this.totalScore === 0) return;

    if (!this.showConfirmPublish) {
      this.showConfirmPublish = true;
      return;
    }

    this.showSuccessBurst = true;

    // 1. Update submission score & status in ContentService
    const currentSubmissions = [...this.contentService.submissions];
    const subIdx = currentSubmissions.findIndex(s => s.id === this.selectedTeam!.id);
    if (subIdx !== -1) {
      currentSubmissions[subIdx] = {
        ...currentSubmissions[subIdx],
        score: this.totalScore,
        status: 'approved',
        feedback: this.judgeNotes || 'Scored by judge.'
      };
      this.contentService.saveSubmissions(currentSubmissions);
      this.contentService.syncGradeToBackend(this.selectedTeam!.id, {
        score: this.totalScore,
        feedback: this.judgeNotes || 'Scored by judge.',
        status: 'approved'
      });
    }

    // 2. Update Leaderboard Entry points dynamically
    const schoolName = this.selectedTeam.school;
    const currentLeaderboard = [...this.contentService.leaderboardData];
    const schoolEntry = currentLeaderboard.find(lb => 
      lb.schoolName.toLowerCase().includes(schoolName.toLowerCase()) || 
      schoolName.toLowerCase().includes(lb.schoolName.toLowerCase())
    );
    
    if (schoolEntry) {
      const track = this.selectedTeam.track.toLowerCase();
      const scoreValue = this.totalScore;
      
      if (track === 'coding') {
        schoolEntry.trackPoints.coding += scoreValue;
      } else if (track === 'robotics') {
        schoolEntry.trackPoints.robotics += scoreValue;
      } else if (track === 'ai' || track === 'ai & ml') {
        schoolEntry.trackPoints.ai += scoreValue;
      } else if (track === 'cyber' || track === 'cybersecurity') {
        schoolEntry.trackPoints.cyber += scoreValue;
      }
      
      schoolEntry.trackPoints.all = 
        (schoolEntry.trackPoints.coding || 0) + 
        (schoolEntry.trackPoints.robotics || 0) + 
        (schoolEntry.trackPoints.ai || 0) + 
        (schoolEntry.trackPoints.cyber || 0);
      schoolEntry.points = schoolEntry.trackPoints.all;
      
      this.contentService.updateLeaderboardEntry(schoolEntry.id, {
        points: schoolEntry.points,
        trackPoints: schoolEntry.trackPoints
      });
    }

    // 3. Add audit log
    const currentAudit = [...this.contentService.auditLogs];
    currentAudit.unshift({
      action: `Published score of ${this.totalScore} for team ${this.selectedTeam.name} (${schoolName})`,
      user: 'judge@ntic.gov.gh',
      time: new Date().toISOString(),
      type: 'system'
    });
    this.contentService.saveAuditLogs(currentAudit);

    this.showToastMsg(`Score ${this.totalScore}/100 published for ${this.selectedTeam.name}`);

    setTimeout(() => {
      this.closeScoring();
    }, 1800);
  }

  private resetRubric(): void {
    this.rubric.forEach(r => (r.score = 0));
  }

  private showToastMsg(msg: string): void {
    this.toastMessage = msg;
    this.showToast = true;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.showToast = false), 3500);
  }

  private animateCounters(): void {
    const duration = 1500;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 4);
      this.animatedStats = {
        pending: Math.round(this.statTargets.pending * ease),
        scored: Math.round(this.statTargets.scored * ease),
        rounds: Math.round(this.statTargets.rounds * ease),
        teams: Math.round(this.statTargets.teams * ease)
      };
      if (t < 1) this.animFrame = requestAnimationFrame(tick);
    };
    this.animFrame = requestAnimationFrame(tick);
  }

  private initArenaCanvas(): void {
    const canvas = this.arenaCanvas?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = devicePixelRatio;
    const resize = () => {
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const stars = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.offsetWidth,
      y: Math.random() * canvas.offsetHeight,
      r: Math.random() * 1.5 + 0.3,
      twinkle: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.02 + 0.01
    }));

    let frame = 0;
    const draw = () => {
      frame++;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      stars.forEach(s => {
        s.twinkle += s.speed;
        const alpha = 0.3 + Math.sin(s.twinkle) * 0.3;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(212, 160, 23, ${alpha})`;
        ctx.fill();
      });

      // Animated gavel sweep line
      const sweepX = (Math.sin(frame * 0.008) + 1) / 2 * w;
      const grad = ctx.createLinearGradient(sweepX - 100, 0, sweepX + 100, 0);
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(0.5, 'rgba(212, 160, 23, 0.08)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      this.canvasAnim = requestAnimationFrame(draw);
    };
    draw();
  }

  getTotalRingOffset(): number {
    const circumference = 2 * Math.PI * 70;
    return circumference - (this.totalScore / 100) * circumference;
  }

  getCategoryPercent(cat: RubricCategory): number {
    return (cat.score / cat.maxScore) * 100;
  }
}
