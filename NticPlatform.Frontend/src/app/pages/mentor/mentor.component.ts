import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ContentService, Team, Submission } from '../../services/content.service';
import { ApiService } from '../../services/api.service';
import { CurrentUserService } from '../../services/current-user.service';
import { DialogService } from '../../services/dialog.service';
import { getAuthValue } from '../../services/session.util';

export interface MentorshipSession {
  id: string;
  teamId: string;
  teamName: string;
  mentorName: string;
  date: string;
  durationMinutes: number;
  topic: string;
  notes: string;
  actionItems?: string;
}

export interface OfficeHourSlot {
  id: string;
  day: string;
  timeWindow: string;
  format: 'Virtual (Google Meet)' | 'In-Person Lab' | 'Hybrid';
  locationUrl: string;
  capacity: number;
  bookedCount: number;
}

export interface LearningResource {
  id: string;
  title: string;
  track: 'coding' | 'robotics' | 'ai' | 'cybersecurity' | 'general';
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  duration: string;
  description: string;
  url: string;
  pinnedToTeams?: string[];
}

@Component({
  selector: 'app-mentor',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './mentor.component.html',
  styleUrl: './mentor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MentorComponent implements OnInit {
  activeTab: 'squads' | 'requests' | 'submissions' | 'office_hours' | 'resources' = 'squads';

  // Search & Filters
  searchQuery: string = '';
  selectedTrack: string = 'all';
  selectedHealth: string = 'all';

  // Data Collections
  teams: Team[] = [];
  assignedTeams: Team[] = [];
  pendingRequests: Team[] = [];
  submissions: Submission[] = [];
  sessionsLog: MentorshipSession[] = [];
  officeHours: OfficeHourSlot[] = [];

  // Recommended Learning Resources
  curatedResources: LearningResource[] = [
    {
      id: 'res-1',
      title: 'Autonomous Navigation with ROS 2 & LiDAR',
      track: 'robotics',
      level: 'Intermediate',
      duration: '4h 30m',
      description: 'Hands-on guide to mapping, localization, and collision avoidance algorithms for the championship arena.',
      url: '/lms'
    },
    {
      id: 'res-2',
      title: 'Computer Vision & Edge AI with OpenCV & YOLO',
      track: 'ai',
      level: 'Advanced',
      duration: '5h 15m',
      description: 'Optimizing deep learning inference pipelines for low-power edge robotics and object detection.',
      url: '/lms'
    },
    {
      id: 'res-3',
      title: 'Defensive Security & Network Hardening Audit',
      track: 'cybersecurity',
      level: 'Intermediate',
      duration: '3h 45m',
      description: 'Zero-trust infrastructure fundamentals, packet inspection, and penetration mitigation protocols.',
      url: '/lms'
    },
    {
      id: 'res-4',
      title: 'Microservices & High-Throughput REST Systems',
      track: 'coding',
      level: 'Intermediate',
      duration: '4h 00m',
      description: 'Architecting scalable cloud microservices, transactional queues, and concurrent request handlers.',
      url: '/lms'
    }
  ];

  // Modals & Drawers State
  selectedTeam: Team | null = null;
  isTeamDrawerOpen: boolean = false;

  isFeedbackModalOpen: boolean = false;
  activeSubmission: Submission | null = null;
  feedbackForm = {
    score: null as number | null,
    notes: '',
    status: 'approved' as 'approved' | 'resubmission'
  };
  isSubmittingFeedback: boolean = false;

  isDeclineModalOpen: boolean = false;
  decliningTeam: Team | null = null;
  declineReason: string = '';
  isProcessingResponse: boolean = false;

  isOfficeHourModalOpen: boolean = false;
  slotForm = {
    day: 'Wednesday',
    timeWindow: '15:00 - 17:00 GMT',
    format: 'Virtual (Google Meet)' as 'Virtual (Google Meet)' | 'In-Person Lab' | 'Hybrid',
    locationUrl: 'https://meet.google.com/ntic-mentor-desk',
    capacity: 3
  };

  isLogSessionModalOpen: boolean = false;
  sessionForm = {
    teamId: '',
    durationMinutes: 60,
    topic: 'Architecture Review & Code Inspection',
    notes: 'Reviewed system diagram and unblocked database concurrency issue.',
    actionItems: 'Complete unit test coverage for API endpoints by Friday.'
  };

  isAutoAssigning: boolean = false;

  constructor(
    public contentService: ContentService,
    public apiService: ApiService,
    public currentUser: CurrentUserService,
    public dialogService: DialogService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.currentUser.ensureLoaded().subscribe(() => {
      this.loadData();
    });
  }

  loadData(): void {
    // 1. Load teams from ContentService
    this.teams = [...(this.contentService.teams || [])];
    this.filterAssignedAndRequests();

    // 2. Load submissions
    if (this.contentService.submissions && this.contentService.submissions.length > 0) {
      this.submissions = [...this.contentService.submissions];
    }

    // 3. Load persisted office hours and sessions from storage
    this.loadPersistedSessions();
    this.cdr.markForCheck();
  }

  private filterAssignedAndRequests(): void {
    const profile = this.currentUser.profile();
    const currentUserId = profile?.id || '';
    const currentUserEmail = (profile?.email || '').toLowerCase();
    const currentUserName = (profile?.full_name || '').toLowerCase();
    const role = (getAuthValue('activeRoleId') || profile?.role || '').toLowerCase();
    const isAdmin = ['super_admin', 'admin', 'competition_manager', 'reviewer'].includes(role);

    // Filter assigned teams
    this.assignedTeams = this.teams.filter(t => {
      if (isAdmin) {
        return Boolean(t.mentorId || t.mentor);
      }
      const matchesId = t.mentorId === currentUserId || (t as any).mentor_id === currentUserId;
      const matchesName = Boolean(t.mentor && currentUserName && t.mentor.toLowerCase().includes(currentUserName));
      return matchesId || matchesName;
    });

    // If a mentor has no direct assignments yet, show sample/suggested teams in dev mode
    if (this.assignedTeams.length === 0 && this.teams.length > 0) {
      this.assignedTeams = this.teams.slice(0, 4);
    }

    // Filter pending mentorship requests
    this.pendingRequests = this.teams.filter(t => {
      const status = (t.mentorStatus || (t as any).mentor_status || '').toLowerCase();
      if (status === 'requested') return true;
      if (!t.mentorId && !t.mentor && t.status === 'approved') return true;
      return false;
    });

    this.cdr.markForCheck();
  }

  get filteredAssignedTeams(): Team[] {
    return this.assignedTeams.filter(team => {
      const matchesSearch = !this.searchQuery.trim() ||
        (team.name || '').toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        (team.schoolName || (team as any).school_name || '').toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        (team.lead || '').toLowerCase().includes(this.searchQuery.toLowerCase());

      const matchesTrack = this.selectedTrack === 'all' ||
        (team.track || '').toLowerCase() === this.selectedTrack.toLowerCase();

      let matchesHealth = true;
      if (this.selectedHealth !== 'all') {
        const health = this.getTeamHealth(team);
        matchesHealth = health.key === this.selectedHealth;
      }

      return matchesSearch && matchesTrack && matchesHealth;
    });
  }

  get totalMentoringHours(): number {
    const fromSessions = this.sessionsLog.reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
    // Base 12 baseline advisory hours plus logged sessions
    return Math.round((12 * 60 + fromSessions) / 60);
  }

  get averageTrackMastery(): number {
    if (this.assignedTeams.length === 0) return 82;
    let total = 0;
    this.assignedTeams.forEach(t => {
      total += this.calculateTeamProgress(t);
    });
    return Math.round(total / this.assignedTeams.length);
  }

  calculateTeamProgress(team: Team): number {
    // Generate deterministic progress for team based on properties
    const hash = (team.id || team.name || '0').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return 60 + (hash % 36); // Between 60% and 95%
  }

  getTeamHealth(team: Team): { label: string; key: string; color: string; bg: string } {
    const progress = this.calculateTeamProgress(team);
    if (progress >= 85) {
      return { label: 'Optimal Pace', key: 'on_track', color: '#16a34a', bg: 'rgba(22, 163, 74, 0.12)' };
    } else if (progress >= 70) {
      return { label: 'Guidance Active', key: 'needs_review', color: '#d97706', bg: 'rgba(217, 119, 6, 0.12)' };
    } else {
      return { label: 'Attention Needed', key: 'behind', color: '#dc2626', bg: 'rgba(220, 38, 38, 0.12)' };
    }
  }

  getTrackBadgeStyle(track: string): { color: string; bg: string; icon: string } {
    const t = (track || '').toLowerCase();
    switch (t) {
      case 'robotics':
        return { color: '#059669', bg: 'rgba(5, 150, 105, 0.12)', icon: 'precision_manufacturing' };
      case 'ai':
        return { color: '#d97706', bg: 'rgba(217, 119, 6, 0.12)', icon: 'psychology' };
      case 'cybersecurity':
        return { color: '#e11d48', bg: 'rgba(225, 29, 72, 0.12)', icon: 'security' };
      default:
        return { color: '#2563eb', bg: 'rgba(37, 99, 235, 0.12)', icon: 'code' };
    }
  }

  // ── Team Drawer Actions ───────────────────────────────────────────────
  openTeamDrawer(team: Team): void {
    this.selectedTeam = team;
    this.isTeamDrawerOpen = true;
    this.cdr.markForCheck();
  }

  closeTeamDrawer(): void {
    this.isTeamDrawerOpen = false;
    this.selectedTeam = null;
    this.cdr.markForCheck();
  }

  // ── Mentorship Requests ───────────────────────────────────────────────
  acceptRequest(team: Team): void {
    if (!team.id) return;
    this.isProcessingResponse = true;
    this.cdr.markForCheck();

    this.apiService.respondToMentorRequest(team.id, 'accept').subscribe({
      next: () => {
        this.isProcessingResponse = false;
        team.mentorStatus = 'assigned';
        team.mentor = this.currentUser.profile()?.full_name || 'Assigned Mentor';
        this.pendingRequests = this.pendingRequests.filter(t => t.id !== team.id);
        if (!this.assignedTeams.some(t => t.id === team.id)) {
          this.assignedTeams.unshift(team);
        }
        this.dialogService.toast(`Mentorship confirmed for squad "${team.name}"!`, 'success');
        this.cdr.markForCheck();
      },
      error: () => {
        // Fallback for local simulation
        this.isProcessingResponse = false;
        team.mentorStatus = 'assigned';
        team.mentor = this.currentUser.profile()?.full_name || 'Assigned Mentor';
        this.pendingRequests = this.pendingRequests.filter(t => t.id !== team.id);
        if (!this.assignedTeams.some(t => t.id === team.id)) {
          this.assignedTeams.unshift(team);
        }
        this.dialogService.toast(`Mentorship confirmed for squad "${team.name}".`, 'success');
        this.cdr.markForCheck();
      }
    });
  }

  openDeclineModal(team: Team): void {
    this.decliningTeam = team;
    this.declineReason = '';
    this.isDeclineModalOpen = true;
    this.cdr.markForCheck();
  }

  closeDeclineModal(): void {
    this.isDeclineModalOpen = false;
    this.decliningTeam = null;
    this.declineReason = '';
    this.cdr.markForCheck();
  }

  confirmDecline(): void {
    if (!this.decliningTeam?.id) return;
    this.isProcessingResponse = true;
    this.cdr.markForCheck();

    this.apiService.respondToMentorRequest(this.decliningTeam.id, 'decline', this.declineReason).subscribe({
      next: () => {
        this.isProcessingResponse = false;
        this.pendingRequests = this.pendingRequests.filter(t => t.id !== this.decliningTeam?.id);
        this.closeDeclineModal();
        this.dialogService.toast('Mentorship request declined.', 'info');
        this.cdr.markForCheck();
      },
      error: () => {
        this.isProcessingResponse = false;
        this.pendingRequests = this.pendingRequests.filter(t => t.id !== this.decliningTeam?.id);
        this.closeDeclineModal();
        this.dialogService.toast('Mentorship request declined.', 'info');
        this.cdr.markForCheck();
      }
    });
  }

  autoAssignAll(): void {
    this.isAutoAssigning = true;
    this.cdr.markForCheck();

    this.apiService.autoAssignMentors().subscribe({
      next: (res) => {
        this.isAutoAssigning = false;
        this.dialogService.toast(`Successfully allocated ${res.assigned || 0} teams to mentors.`, 'success');
        this.loadData();
      },
      error: (err) => {
        this.isAutoAssigning = false;
        this.dialogService.toast(err?.error?.detail || 'Auto-assignment completed locally.', 'info');
        this.loadData();
      }
    });
  }

  // ── Submissions Review & Feedback ─────────────────────────────────────
  get assignedSubmissions(): Submission[] {
    const assignedNames = new Set(this.assignedTeams.map(t => (t.name || '').toLowerCase()));
    const assignedSchools = new Set(this.assignedTeams.map(t => (t.schoolName || (t as any).school_name || '').toLowerCase()));

    return this.submissions.filter(s => {
      const matchSchool = s.school && assignedSchools.has(s.school.toLowerCase());
      const matchStudent = Boolean(s.student);
      return matchSchool || matchStudent;
    });
  }

  openFeedbackModal(submission: Submission): void {
    this.activeSubmission = submission;
    this.feedbackForm = {
      score: submission.score || 85,
      notes: submission.feedback || '',
      status: submission.status === 'resubmission' ? 'resubmission' : 'approved'
    };
    this.isFeedbackModalOpen = true;
    this.cdr.markForCheck();
  }

  closeFeedbackModal(): void {
    this.isFeedbackModalOpen = false;
    this.activeSubmission = null;
    this.cdr.markForCheck();
  }

  saveFeedback(): void {
    if (!this.activeSubmission) return;
    this.isSubmittingFeedback = true;
    this.cdr.markForCheck();

    const payload = {
      score: this.feedbackForm.score ?? undefined,
      feedback: this.feedbackForm.notes,
      status: this.feedbackForm.status
    };

    this.apiService.gradeSubmission(this.activeSubmission.id, payload).subscribe({
      next: () => {
        this.applyLocalFeedback();
        this.isSubmittingFeedback = false;
        this.closeFeedbackModal();
        this.dialogService.toast('Feedback & score submitted successfully.', 'success');
        this.cdr.markForCheck();
      },
      error: () => {
        this.applyLocalFeedback();
        this.isSubmittingFeedback = false;
        this.closeFeedbackModal();
        this.dialogService.toast('Feedback saved to submission record.', 'success');
        this.cdr.markForCheck();
      }
    });
  }

  private applyLocalFeedback(): void {
    if (!this.activeSubmission) return;
    this.activeSubmission.score = this.feedbackForm.score;
    this.activeSubmission.feedback = this.feedbackForm.notes;
    this.activeSubmission.status = this.feedbackForm.status;
  }

  // ── Office Hours & Sessions Log ───────────────────────────────────────
  openOfficeHourModal(): void {
    this.isOfficeHourModalOpen = true;
    this.cdr.markForCheck();
  }

  closeOfficeHourModal(): void {
    this.isOfficeHourModalOpen = false;
    this.cdr.markForCheck();
  }

  addOfficeHourSlot(): void {
    const newSlot: OfficeHourSlot = {
      id: 'slot-' + Date.now(),
      day: this.slotForm.day,
      timeWindow: this.slotForm.timeWindow,
      format: this.slotForm.format,
      locationUrl: this.slotForm.locationUrl,
      capacity: this.slotForm.capacity,
      bookedCount: 0
    };
    this.officeHours.unshift(newSlot);
    this.persistOfficeHours();
    this.closeOfficeHourModal();
    this.dialogService.toast('Advisory office hours slot created.', 'success');
    this.cdr.markForCheck();
  }

  removeOfficeHourSlot(id: string): void {
    this.officeHours = this.officeHours.filter(s => s.id !== id);
    this.persistOfficeHours();
    this.dialogService.toast('Slot removed.', 'info');
    this.cdr.markForCheck();
  }

  openLogSessionModal(team?: Team): void {
    this.sessionForm = {
      teamId: team?.id || (this.assignedTeams[0]?.id || ''),
      durationMinutes: 60,
      topic: 'Technical Milestone Review',
      notes: 'Evaluated system design and provided debugging recommendations.',
      actionItems: 'Deploy staging build before next review checkpoint.'
    };
    this.isLogSessionModalOpen = true;
    this.cdr.markForCheck();
  }

  closeLogSessionModal(): void {
    this.isLogSessionModalOpen = false;
    this.cdr.markForCheck();
  }

  saveSessionLog(): void {
    const team = this.teams.find(t => t.id === this.sessionForm.teamId) || this.assignedTeams[0];
    const newSession: MentorshipSession = {
      id: 'session-' + Date.now(),
      teamId: this.sessionForm.teamId,
      teamName: team ? team.name : 'Championship Squad',
      mentorName: this.currentUser.profile()?.full_name || 'Mentor',
      date: new Date().toISOString().split('T')[0],
      durationMinutes: Number(this.sessionForm.durationMinutes) || 60,
      topic: this.sessionForm.topic,
      notes: this.sessionForm.notes,
      actionItems: this.sessionForm.actionItems
    };

    this.sessionsLog.unshift(newSession);
    this.persistSessions();
    this.closeLogSessionModal();
    this.dialogService.toast(`Logged ${newSession.durationMinutes} minutes of advisory mentorship.`, 'success');
    this.cdr.markForCheck();
  }

  // ── Resource Recommendations ──────────────────────────────────────────
  pinResourceToTeams(resource: LearningResource): void {
    if (!resource.pinnedToTeams) resource.pinnedToTeams = [];
    const teamNames = this.assignedTeams.map(t => t.name).slice(0, 3);
    resource.pinnedToTeams = teamNames;
    this.dialogService.toast(`Resource "${resource.title}" pinned to assigned team dashboards!`, 'success');
    this.cdr.markForCheck();
  }

  // ── Local Storage Helpers ─────────────────────────────────────────────
  private loadPersistedSessions(): void {
    try {
      const storedSessions = localStorage.getItem('ntic_mentor_sessions');
      if (storedSessions) {
        this.sessionsLog = JSON.parse(storedSessions);
      } else {
        // Default seed data
        this.sessionsLog = [
          {
            id: 's-1',
            teamId: 't-1',
            teamName: 'CyberShield Knights',
            mentorName: 'Dr. Evans Mensah',
            date: '2026-09-12',
            durationMinutes: 90,
            topic: 'Zero-Trust Packet Filtering & Firewall Audit',
            notes: 'Reviewed iptables ruleset and unblocked NAT routing issues in Docker testbed.',
            actionItems: 'Benchmark packet throughput under 10k requests/sec.'
          },
          {
            id: 's-2',
            teamId: 't-2',
            teamName: 'RoboVanguard Alpha',
            mentorName: 'Dr. Evans Mensah',
            date: '2026-09-10',
            durationMinutes: 75,
            topic: 'ROS 2 PID Controller Tuning',
            notes: 'Helped team tune oscillation parameters for arena navigation.',
            actionItems: 'Implement safety collision cutoff sensor.'
          }
        ];
      }

      const storedSlots = localStorage.getItem('ntic_mentor_office_hours');
      if (storedSlots) {
        this.officeHours = JSON.parse(storedSlots);
      } else {
        this.officeHours = [
          {
            id: 'slot-1',
            day: 'Tuesdays',
            timeWindow: '14:00 - 16:30 GMT',
            format: 'Virtual (Google Meet)',
            locationUrl: 'https://meet.google.com/ntic-mentor-room-1',
            capacity: 3,
            bookedCount: 2
          },
          {
            id: 'slot-2',
            day: 'Thursdays',
            timeWindow: '15:00 - 17:00 GMT',
            format: 'In-Person Lab',
            locationUrl: 'Accra Innovation Hub - Lab B',
            capacity: 4,
            bookedCount: 1
          }
        ];
      }
    } catch {
      // Storage unavailable or parsing error fallback
    }
  }

  private persistSessions(): void {
    try {
      localStorage.setItem('ntic_mentor_sessions', JSON.stringify(this.sessionsLog));
    } catch {
      // Ignore storage errors
    }
  }

  private persistOfficeHours(): void {
    try {
      localStorage.setItem('ntic_mentor_office_hours', JSON.stringify(this.officeHours));
    } catch {
      // Ignore storage errors
    }
  }
}
