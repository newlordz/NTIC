import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  ContentService,
  ChampionshipStory,
  HallOfFameEntry,
  LeaderboardEntry,
  NewsFeedItem,
  TalentDiscovery
} from '../../services/content.service';
import { BrevoEmailService } from '../../services/brevo-email.service';
import { FileStorageService } from '../../services/file-storage.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, OnDestroy {
  activeRoleId = 'super_admin';
  dashboardTitle = 'Dashboard';
  dashboardSubtitle = 'NTIC Platform Portal';

  stats: any[] = [];

  // ─── LIVE TELEMETRY ──────────────────────────
  private liveIntervals: any[] = [];
  liveTime = '';
  connectionPulse = true;

  // sparkline history per node (last 12 readings as % 0-100)
  nodeHistory: number[][] = [
    [10, 12, 8, 14, 11, 13, 12, 15, 10, 12, 11, 12],
    [35, 40, 38, 42, 36, 39, 38, 40, 37, 38, 36, 38],
    [4,  5,  6,  4,  7,  5,  6,  4,  5,  6,  5,  5],
    [20, 22, 21, 24, 22, 23, 21, 22, 23, 21, 22, 22]
  ];
  // raw numeric values for live display
  nodeLive = [
    { latencyMs: 42, loadPct: 12 },
    { latencyMs: 85, loadPct: 38 },
    { latencyMs: 110, loadPct: 5 },
    { latencyMs: 15, loadPct: 22 }
  ];

  // ─── SUPER ADMIN STATE ─────────────────────────
  adminTab: 'overview' | 'register' | 'tickets' | 'approvals' | 'content' | 'users' | 'admins' = 'overview';
  registerRole: 'judge' | 'sponsor' = 'judge';
  ticketFilter: 'all' | 'judge' | 'sponsor' = 'all';
  isRegModalOpen = false;
  isAdminModalOpen = false;
  editingAdmin: any = null;
  adminForm: any = {};
  adminError = '';
  adminSuccess = '';
  deleteConfirmAdmin: any = null;
  roleModalRole: string | null = null;
  roleModalUsers: any[] = [];
  hoverUsers: any[] = [];
  hoverPos = { x: 0, y: 0 };

  // ─── USER MANAGEMENT ──────────────────────
  userSearch = '';
  userRoleFilter = 'all';
  userStatusFilter = 'all';
  editingUserId: string | null = null;
  deleteUserConfirm: any = null;

  // ─── CONTENT MANAGER STATE ──────────────────────
  contentTab: 'stories' | 'hof' | 'leaderboard' | 'talent' | 'stats' | 'news' | 'countdown' | 'slideshow' = 'stories';
  maximizedContentTab: string | null = null;

  // Story form
  storyForm: Omit<ChampionshipStory, 'id'> = {
    tag: 'Robotics',
    tagColor: '',
    image: '',
    date: '',
    readTime: '5 min read',
    title: '',
    body: ''
  };
  storyFormOpen = false;
  storyFormError = '';
  editingStoryId: string | null = null;

  // HoF form
  hofForm: Omit<HallOfFameEntry, 'id'> = {
    initials: '',
    name: '',
    school: '',
    year: new Date().getFullYear().toString(),
    badge: '',
    trackClass: 'coding-track',
    expiryDate: ''
  };
  hofFormOpen = false;
  hofFormError = '';
  editingHofId: string | null = null;

  // Leaderboard form
  lbForm: Omit<LeaderboardEntry, 'id'> = {
    rank: '',
    schoolName: '',
    location: '',
    region: '',
    points: 0,
    trackPoints: { all: 0, coding: 0, robotics: 0, ai: 0, cyber: 0 }
  };
  lbFormOpen = false;
  lbFormError = '';
  lbEditId: string | null = null;

  // Talent Discovery form
  tdForm: Omit<TalentDiscovery, 'id'> = {
    category: 'Algorithm Design',
    studentName: '',
    schoolAndGrade: '',
    score: '',
    badgeColor: 'primary'
  };
  tdFormOpen = false;
  tdFormError = '';
  tdEditId: string | null = null;

  // News form
  newsForm: Omit<NewsFeedItem, 'id'> = {
    headline: '',
    tag: 'Announcement',
    date: '',
    link: '#'
  };
  newsFormOpen = false;
  newsFormError = '';
  editingNewsId: string | null = null;

  // Stats edit mode
  statsEditMode = false;
  statsForm = { regions: 16, mentors: 800, schools: 180, students: 12, projects: 1.5, grants: 2 };

  // Countdown settings
  countdownInput: string = '';
  previewDays = 0;
  previewHours = 0;
  previewMins = 0;
  previewSecs = 0;

  // School Admin Portal Specific Flow
  schoolName = '';
  isAddTeamModalOpen = false;
  teamForm = { name: '', track: 'Coding', lead: '', members: 4, mentor: '', motto: '', memberNames: ['', '', '', '', '', '', '', ''] };

  // Registration form
  regForm = {
    fullName: '',
    email: '',
    organization: '',
    phone: '',
    track: '',    // for judges
    tracks: [] as string[],
    tier: '',     // for sponsors
    notes: ''
  };
  regSubmitting = false;
  regSuccess = false;
  regError = '';

  // Registered users with generated tickets
  get registeredUsers(): any[] {
    return this.contentService.users;
  }
  set registeredUsers(val: any[]) {
    this.contentService.saveUsers(val);
  }

  get adminUsers(): any[] {
    return this.contentService.users.filter(u =>
      ['super_admin', 'content_manager', 'reviewer', 'competition_manager'].includes(u.role)
    );
  }

  get pendingApprovals(): any[] {
    return this.contentService.pendingApprovals;
  }
  set pendingApprovals(val: any[]) {
    this.contentService.saveApprovals(val);
  }

  get registeredTeams(): any[] {
    return this.contentService.teams;
  }
  set registeredTeams(val: any[]) {
    this.contentService.saveTeams(val);
  }

  get roleDistribution(): { role: string; label: string; count: number; percent: number; icon: string }[] {
    const roleMeta: Record<string, { label: string; icon: string }> = {
      super_admin:     { label: 'Super Admin',     icon: 'admin_panel_settings' },
      content_manager: { label: 'Content Manager', icon: 'edit_note' },
      reviewer:        { label: 'Reviewer',        icon: 'rate_review' },
      competition_manager:{ label: 'Competition Manager', icon: 'emoji_events' },
      school_admin:    { label: 'School Admin',    icon: 'domain' },
      instructor:      { label: 'Instructor',      icon: 'patient_list' },
      judge:           { label: 'Judge',           icon: 'gavel' },
      sponsor:         { label: 'Sponsor',         icon: 'handshake' },
      student:         { label: 'Student',         icon: 'school' },
    };
    const total = this.registeredUsers.length || 1;
    const counts: Record<string, number> = {};
    this.registeredUsers.forEach(u => {
      const role = u.role || 'student';
      counts[role] = (counts[role] || 0) + 1;
    });
    return Object.keys(roleMeta).map(role => ({
      role,
      label: roleMeta[role].label,
      icon: roleMeta[role].icon,
      count: counts[role] || 0,
      percent: Math.round(((counts[role] || 0) / total) * 100),
    }));
  }

  get auditLogs(): any[] {
    return this.contentService.auditLogs;
  }
  set auditLogs(val: any[]) {
    this.contentService.saveAuditLogs(val);
  }

  get csrUpdates(): any[] {
    return this.contentService.csrUpdates;
  }
  set csrUpdates(val: any[]) {
    this.contentService.saveCsrUpdates(val);
  }

  get mySubmissions(): any[] {
    return this.contentService.submissions
      .filter(s => s.student === 'Kwame Asante')
      .map(s => ({
        track: s.track,
        file: s.file,
        date: s.time,
        status: s.status === 'approved' ? 'Approved' : s.status === 'pending' ? 'Pending' : 'Needs Resubmission',
        feedback: s.feedback || (s.status === 'pending' ? 'Awaiting mentor evaluation' : '')
      }));
  }

  get recentSubmissions(): any[] {
    return this.contentService.submissions.map(s => ({
      name: s.student,
      school: s.school,
      track: s.track.toLowerCase(),
      file: s.file,
      time: s.time,
      status: s.status
    }));
  }

  get assignedSubmissions(): any[] {
    const activeUserEmail = localStorage.getItem('activeUserEmail') || '';
    const activeUser = this.contentService.users.find(u => u.email === activeUserEmail || u.ticket === activeUserEmail);
    const judgeTrack = activeUser?.track?.toLowerCase() || '';

    return this.contentService.submissions
      .filter(s => !judgeTrack || s.track.toLowerCase().includes(judgeTrack) || judgeTrack.includes(s.track.toLowerCase()))
      .map(s => ({
        id: s.id,
        team: s.student + ' (' + s.school + ')',
        project: s.assignment,
        track: s.track,
        submitted: s.time,
        score: s.score
      }));
  }

  get sponsoredTeams(): any[] {
    return this.contentService.teams.map(t => ({
      school: t.schoolName || 'Partner School',
      team: t.name,
      track: t.track,
      sponsorship: t.track === 'Robotics' ? '₵ 30,000' : t.track === 'Cybersecurity' ? '₵ 20,000' : '₵ 15,000',
      performance: t.status === 'Qualified' ? 'Top 2%' : 'Top 10%'
    }));
  }

  get recentScores(): any[] {
    return this.contentService.submissions
      .filter(s => s.score !== null)
      .map(s => ({
        team: s.student + ' (' + s.school + ')',
        score: s.score,
        criterion: 'Judged Score',
        date: s.time
      }));
  }

  // System nodes
  systemNodes = [
    { name: 'Main Auth Service', status: 'Healthy', latency: '42ms', load: '12%', color: 'primary' },
    { name: 'LMS Storage Bucket', status: 'Healthy', latency: '85ms', load: '38%', color: 'secondary' },
    { name: 'Compiler & Sandbox VM', status: 'Healthy', latency: '110ms', load: '5%', color: 'tertiary' },
    { name: 'Analytics Engine DB', status: 'Healthy', latency: '15ms', load: '22%', color: 'error' }
  ];

  // Ticket being copied
  copiedTicket: string | null = null;

  // Modal state for viewing ticket
  viewTicketUser: any = null;
  availableTracks = [
    'Coding & Algorithms',
    'Robotics & IoT',
    'Artificial Intelligence',
    'Cybersecurity CTF',
    'Open Innovation'
  ];

  isRegFormTrackSelected(track: string): boolean {
    return this.regForm && this.regForm.tracks && this.regForm.tracks.includes(track);
  }

  toggleRegFormTrack(track: string): void {
    if (!this.regForm) return;
    if (!this.regForm.tracks) {
      this.regForm.tracks = [];
    }
    const idx = this.regForm.tracks.indexOf(track);
    if (idx > -1) {
      this.regForm.tracks.splice(idx, 1);
    } else {
      this.regForm.tracks.push(track);
    }
  }

  // Modal states for approvals
  activePreviewRequest: any | null = null;
  activeReviewRequest: any | null = null;
  reviewReasons: string[] = [];
  selectedReasons: Record<string, boolean> = {};
  rejectionNotes: string = '';

  // Document viewer states
  activeDocumentName: string | null = null;
  activeDocumentType: 'pdf' | 'spreadsheet' | null = null;
  activeDocumentSchool: string = '';

  // Role-Specific Data for other roles
  enrolledTracks = [
    { name: 'Python Data Structures', icon: 'data_object', progress: 68, lastActive: '2 days ago', module: 'Module 4 of 8', color: 'primary' },
    { name: 'Intro to Neural Networks', icon: 'model_training', progress: 15, lastActive: '1 week ago', module: 'Module 1 of 6', color: 'tertiary' }
  ];

  selectedCourseLeaderboardTrack = 'Python Data Structures';

  courseCycleLeaderboards: Record<string, Array<{
    rank: number;
    name: string;
    school: string;
    progressPct: number;
    accuracyPct: number;
    streakDays: number;
    algoScore: number;
    isCurrentUser: boolean;
  }>> = {};

  get activeCourseLeaderboardList() {
    return this.courseCycleLeaderboards[this.selectedCourseLeaderboardTrack] || [];
  }

  activeTracks = [
    { name: 'Python Data Structures', icon: 'data_object', module: 'Module 4 of 8', enrolled: 320, completion: 68, color: 'primary', status: 'In Progress' },
    { name: 'Arduino Robotics Base', icon: 'memory', module: 'Module 3 of 6', enrolled: 180, completion: 42, color: 'secondary', status: 'In Progress' },
    { name: 'Intro to Neural Networks', icon: 'model_training', module: 'Starting Soon', enrolled: 85, completion: 85, color: 'tertiary', status: 'Planning' },
    { name: 'Ethical Hacking 101', icon: 'security', module: 'Module 1 of 5', enrolled: 140, completion: 22, color: 'error', status: 'In Progress' },
  ];

  milestoneActivity = [
    { text: 'Robotics Team A completed Module 3 base assessment', time: '1h ago' },
    { text: 'Coding Team Alpha submitted pathfinder_v2.py', time: '3h ago' },
    { text: 'Mentor feedback published for AI Division', time: '5h ago' }
  ];

  constructor(public contentService: ContentService, private route: ActivatedRoute, private router: Router, private emailService: BrevoEmailService, private fileStorage: FileStorageService, private cdr: ChangeDetectorRef) {}

  logoUrls: Record<string, string> = {};

  async loadLogo(fileId: string): Promise<string> {
    if (this.logoUrls[fileId]) return this.logoUrls[fileId];
    const url = await this.fileStorage.getUrl(fileId);
    if (url) { this.logoUrls[fileId] = url; this.cdr.detectChanges(); return url; }
    return '';
  }

  preloadLogos(): void {
    const allApprovals = [
      ...this.contentService.pendingApprovals,
      ...this.contentService.approvedApprovals,
      ...this.contentService.rejectedApprovals
    ];
    for (const req of allApprovals) {
      if (req.details?.logoFileId) {
        this.loadLogo(req.details.logoFileId);
      }
    }
  }

  getLogoUrl(details: any): string {
    if (details?.logoFileId && this.logoUrls[details.logoFileId]) return this.logoUrls[details.logoFileId];
    return '';
  }

  addAuditLog(log: any): void {
    const currentAudit = [...this.contentService.auditLogs];
    currentAudit.unshift({
      time: 'Just now',
      user: 'admin@ntic.org.gh',
      type: 'system',
      ...log
    });
    if (currentAudit.length > 30) {
      currentAudit.pop();
    }
    this.contentService.saveAuditLogs(currentAudit);
  }

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      setTimeout(() => {
        window.scrollTo(0, 0);
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
          mainContent.scrollTop = 0;
        }
      }, 0);
    }
    this.activeRoleId = localStorage.getItem('activeRoleId') || 'student';
    this.loadDashboardData();
    this.preloadLogos();

    // Read query params to set active tab & modal state reactively
    this.route.queryParams.subscribe(params => {
      if (params['tab'] && ['overview', 'register', 'tickets', 'approvals', 'content', 'users', 'admins'].includes(params['tab'])) {
        this.adminTab = params['tab'] as any;
      }
      this.isRegModalOpen = params['openRegModal'] === 'true';
      if (params['action'] === 'add_team') {
        this.openAddTeamModal();
      }
    });

    if (this.activeRoleId === 'super_admin') {
      this.startLiveTelemetry();
      // Sync stats form from service
      this.statsForm = { ...this.contentService.platformStats };
      // Sync countdown input from service (format: YYYY-MM-DDTHH:mm)
      if (this.contentService.countdownDate) {
        this.countdownInput = this.contentService.countdownDate.substring(0, 16);
      }
    }
  }

  ngOnDestroy(): void {
    this.liveIntervals.forEach(id => clearInterval(id));
  }

  loadDashboardData(): void {
    const activeEmail = localStorage.getItem('activeUserEmail') || '';
    const activeUser = this.contentService.users.find(u => 
      u.email?.trim().toLowerCase() === activeEmail.toLowerCase() ||
      u.ticket?.trim().toUpperCase() === activeEmail.toUpperCase()
    );
    const userName = activeUser ? activeUser.fullName : (this.activeRoleId === 'super_admin' ? 'System Administrator' : 'Administrator');

    if (activeUser && activeUser.role === 'school_admin') {
      this.schoolName = activeUser.organization || '';
    } else {
      this.schoolName = '';
    }

    switch (this.activeRoleId) {
      case 'student':
        this.dashboardTitle = 'Student Dashboard';
        this.dashboardSubtitle = `Welcome back, ${userName}. Track your learning, submissions, and competition progress.`;
        this.stats = [
          { label: 'My Total Points', value: '350 pts', icon: 'military_tech', meta: '+50 pts this week', color: 'primary' },
          { label: 'Course Progress', value: '68%', icon: 'school', meta: 'Module 4 of 8', color: 'secondary' },
          { label: 'Leaderboard Rank', value: '#12', icon: 'leaderboard', meta: 'Out of 1,248 students', color: 'tertiary' },
          { label: 'My Submissions', value: '2', icon: 'assignment_turned_in', meta: '1 Approved, 1 Pending', color: 'error' }
        ];
        break;

      case 'instructor':
        this.dashboardTitle = 'Instructor Dashboard';
        this.dashboardSubtitle = `Welcome back, ${userName}. Overview of the National NTIC Competition Platform.`;
        this.stats = [
          { label: 'Total Students', value: '1,248', icon: 'group', meta: '+12% this week', color: 'primary' },
          { label: 'Schools', value: '47', icon: 'account_balance', meta: '3 new this month', color: 'secondary' },
          { label: 'Pending Reviews', value: '42', icon: 'pending_actions', meta: 'Requires attention', color: 'error' },
          { label: 'Active Competitions', value: String(this.contentService.competitions.length), icon: 'emoji_events', meta: 'Real-time sync', color: 'tertiary' }
        ];
        break;

      case 'school_admin':
        this.dashboardTitle = activeUser ? `${activeUser.organization} Admin Dashboard` : 'School Admin Dashboard';
        this.dashboardSubtitle = `Welcome back, ${userName}. NTIC Analytics & Team Management.`;
        this.stats = this.schoolAdminStats;
        break;

      case 'judge':
        this.dashboardTitle = 'Judge Dashboard';
        this.dashboardSubtitle = `Welcome back, ${userName}. National Competition Scoring Panel.`;
        this.stats = [
          { label: 'Assigned Submissions', value: '18', icon: 'gavel', meta: 'Coding & AI tracks', color: 'primary' },
          { label: 'Graded Projects', value: '14', icon: 'done_all', meta: '78% complete', color: 'secondary' },
          { label: 'Pending Evaluations', value: '4', icon: 'pending', meta: 'Due by Saturday', color: 'error' },
          { label: 'Average Score Given', value: '78.2', icon: 'bar_chart', meta: 'Standard bell curve', color: 'tertiary' }
        ];
        break;

      case 'sponsor':
        this.dashboardTitle = activeUser ? `${activeUser.organization} Sponsor Dashboard` : 'Sponsor Dashboard';
        this.dashboardSubtitle = `Welcome back, ${userName}. Corporate Sponsorship & CSR Impact Panel.`;
        this.stats = [
          { label: 'Total Funding Committed', value: '₵ 240,000', icon: 'payments', meta: 'Tullow Ghana CSR', color: 'primary' },
          { label: 'Sponsored Schools', value: '12', icon: 'school', meta: 'Across 4 regions', color: 'secondary' },
          { label: 'Supported Students', value: '250', icon: 'child_care', meta: 'Scholarship program', color: 'tertiary' },
          { label: 'Flagged High-Talents', value: '15', icon: 'verified', meta: 'Ready for internship', color: 'error' }
        ];
        break;

      case 'super_admin':
        this.dashboardTitle = 'Command Center';
        this.dashboardSubtitle = 'National NTIC Platform · System Administration & Access Control';
        this.stats = [
          { label: 'Total Registered Users', value: String(this.registeredUsers.length), icon: 'manage_accounts', meta: '6 distinct portals', color: 'primary' },
          { label: 'System Health', value: '100%', icon: 'cloud_done', meta: 'All 4 nodes green', color: 'secondary' },
          { label: 'Pending Approvals', value: String(this.pendingApprovals.length), icon: 'verified_user', meta: this.pendingApprovals.length > 0 ? 'Action required' : 'All clear', color: 'error' },
          { label: 'Active Tokens', value: String(this.registeredUsers.filter(u => u.status === 'Active').length), icon: 'token', meta: `${this.registeredUsers.filter(u => u.role === 'judge').length} Judges · ${this.registeredUsers.filter(u => u.role === 'sponsor').length} Sponsors`, color: 'tertiary' }
        ];
        break;
    }
  }

  onStatCardClick(stat: any): void {
    if (!stat || !stat.label) return;
    const label = stat.label.toLowerCase();

    if (this.activeRoleId === 'super_admin') {
      if (label.includes('registered users') || label.includes('users')) {
        this.adminTab = 'users';
      } else if (label.includes('pending approvals') || label.includes('approvals')) {
        this.adminTab = 'approvals';
      } else if (label.includes('active tokens') || label.includes('tokens')) {
        this.adminTab = 'tickets';
      } else if (label.includes('system health') || label.includes('health')) {
        this.adminTab = 'overview';
      }
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 260, behavior: 'smooth' });
      }
    }
  }

  get filteredRegisteredUsers(): any[] {
    if (this.ticketFilter === 'all') return this.registeredUsers;
    return this.registeredUsers.filter(u => u.role === this.ticketFilter);
  }

  get managedUsers(): any[] {
    let list = [...this.registeredUsers];
    if (this.userRoleFilter !== 'all') {
      list = list.filter(u => u.role === this.userRoleFilter);
    }
    if (this.userStatusFilter !== 'all') {
      list = list.filter(u => u.status.toLowerCase() === this.userStatusFilter);
    }
    if (this.userSearch.trim()) {
      const q = this.userSearch.toLowerCase();
      list = list.filter(u =>
        u.fullName?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.organization?.toLowerCase().includes(q) ||
        u.ticket?.toLowerCase().includes(q)
      );
    }
    return list;
  }

  toggleUserStatus(user: any): void {
    const users = [...this.contentService.users];
    const idx = users.findIndex(u => u.id === user.id);
    if (idx > -1) {
      users[idx].status = users[idx].status === 'Active' ? 'Suspended' : 'Active';
      this.contentService.saveUsers(users);
    }
  }

  deleteUserFromTable(user: any): void {
    this.deleteUserConfirm = user;
  }

  confirmDeleteUser(): void {
    if (!this.deleteUserConfirm) return;
    const users = this.contentService.users.filter(u => u.id !== this.deleteUserConfirm.id);
    this.contentService.saveUsers(users);
    this.deleteUserConfirm = null;
  }

  cancelDeleteUser(): void {
    this.deleteUserConfirm = null;
  }

  generateTicket(role: 'judge' | 'sponsor'): string {
    const prefix = role === 'judge' ? 'JDG' : 'SPO';
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `NTIC-${prefix}-${code}`;
  }

  showRoleHover(role: string, event: MouseEvent): void {
    this.hoverUsers = this.registeredUsers.filter(u => u.role === role);
    this.hoverPos = { x: event.clientX, y: event.clientY };
  }

  hideRoleHover(): void {
    this.hoverUsers = [];
  }

  openRoleModal(role: string): void {
    this.roleModalRole = role;
    this.roleModalUsers = this.registeredUsers.filter(u => u.role === role);
  }

  closeRoleModal(): void {
    this.roleModalRole = null;
    this.roleModalUsers = [];
  }

  openRegisterModal(): void {
    this.isRegModalOpen = true;
    this.regError = '';
    this.regSuccess = false;
    this.regForm = { fullName: '', email: '', organization: '', phone: '', track: '', tracks: [], tier: '', notes: '' };
  }

  closeRegisterModal(): void {
    this.isRegModalOpen = false;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { openRegModal: null },
      queryParamsHandling: 'merge'
    });
  }

  submitRegistration(): void {
    if (!this.regForm.fullName || !this.regForm.email || !this.regForm.organization) {
      this.regError = 'Please fill in all required fields.';
      return;
    }
    if (this.registerRole === 'judge' && (!this.regForm.tracks || this.regForm.tracks.length === 0)) {
      this.regError = 'Please select at least one assigned track.';
      return;
    }
    this.regError = '';
    this.regSubmitting = true;

    setTimeout(() => {
      const ticket = this.generateTicket(this.registerRole);
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const newUser = {
        id: `USR-${String(this.registeredUsers.length + 1).padStart(3, '0')}`,
        role: this.registerRole,
        fullName: this.regForm.fullName,
        email: this.regForm.email,
        phone: this.regForm.phone || '+233 24 555 0192',
        otp,
        password: otp,
        organization: this.regForm.organization,
        track: this.registerRole === 'judge' ? (this.regForm.tracks && this.regForm.tracks.join(', ')) : undefined,
        tier: this.registerRole === 'sponsor' ? this.regForm.tier : undefined,
        ticket,
        status: 'Active',
        registeredAt: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, ' '),
        lastLogin: 'Never'
      };
      const currentUsers = [...this.contentService.users];
      currentUsers.unshift(newUser);
      this.contentService.saveUsers(currentUsers);

      const currentAudit = [...this.contentService.auditLogs];
      currentAudit.unshift({
        action: `${this.registerRole === 'judge' ? 'Judge' : 'Sponsor'} token ${ticket} generated for ${this.regForm.fullName}`,
        user: 'admin@ntic.org.gh',
        time: 'Just now',
        type: 'ticket'
      });
      this.contentService.saveAuditLogs(currentAudit);
      // Update stat
      this.stats = this.stats.map(s =>
        s.icon === 'token'
          ? { ...s, value: String(this.registeredUsers.length), meta: `${this.registeredUsers.filter(u => u.role === 'judge').length} Judges · ${this.registeredUsers.filter(u => u.role === 'sponsor').length} Sponsors` }
          : s
      );

      this.regSubmitting = false;
      this.regSuccess = true;
      this.isRegModalOpen = false; // Close the registration popup modal
      this.showTicketModal(newUser);

      // Reset form
      this.regForm = { fullName: '', email: '', organization: '', phone: '', track: '', tracks: [], tier: '', notes: '' };

      // Clear the query parameter so the modal doesn't reopen
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { openRegModal: null },
        queryParamsHandling: 'merge'
      });

      setTimeout(() => { this.regSuccess = false; }, 4000);
    }, 1200);
  }

  copyTicket(ticket: string): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ticket)
        .then(() => {
          this.copiedTicket = ticket;
          setTimeout(() => { if (this.copiedTicket === ticket) this.copiedTicket = null; }, 2000);
        })
        .catch(() => {
          this.fallbackCopyText(ticket);
        });
    } else {
      this.fallbackCopyText(ticket);
    }
  }

  private fallbackCopyText(text: string): void {
    if (typeof document !== 'undefined') {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        this.copiedTicket = text;
        setTimeout(() => { if (this.copiedTicket === text) this.copiedTicket = null; }, 2000);
      } catch (err) {
        console.error('Fallback copy failed', err);
      }
      document.body.removeChild(textArea);
    }
  }

  showTicketModal(user: any): void {
    this.viewTicketUser = user;
    setTimeout(() => {
      if (typeof document !== 'undefined') {
        const modal = document.querySelector('.ticket-modal');
        if (modal) {
          modal.scrollTop = 0;
        }
      }
    }, 50);
  }

  viewUserDetails(user: any): void {
    this.showTicketModal(user);
  }

  private approvingIds = new Set<string>();

  approveRequest(req: any): void {
    if (this.approvingIds.has(req.id)) return;
    this.approvingIds.add(req.id);

    const approved = {
      ...req,
      reviewedAt: new Date().toLocaleString('en-GB'),
      reviewer: 'admin@ntic.org.gh'
    };
    const currentApproved = [...this.contentService.approvedApprovals];
    currentApproved.unshift(approved);
    this.contentService.saveApprovedApprovals(currentApproved);

    this.pendingApprovals = this.pendingApprovals.filter(r => r.id !== req.id);

    // Apply side-effects depending on the type of approval request
    if (req.type === 'School Registration') {
      const ticket = 'NTIC-SCH-' + Math.random().toString(36).substring(2, 6).toUpperCase();
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const newSchoolAdmin = {
        id: 'USR-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        role: 'school_admin' as const,
        fullName: req.entity + ' Admin',
        email: req.contact,
        phone: req.details?.phone || '+233 24 555 1234',
        otp,
        password: otp,
        organization: req.entity,
        ticket,
        status: 'Active',
        registeredAt: new Date().toLocaleDateString('en-GB'),
        lastLogin: 'Never'
      };
      
      const currentUsers = [...this.contentService.users];
      currentUsers.push(newSchoolAdmin);
      this.contentService.saveUsers(currentUsers);

      const stats = { ...this.contentService.platformStats };
      stats.schools += 1;
      this.contentService.updatePlatformStats(stats);

      if (req.details?.teamsList && Array.isArray(req.details.teamsList)) {
        const currentTeams = [...this.contentService.teams];
        req.details.teamsList.forEach((t: any) => {
          const roster = [t.leadName, t.member2Name, t.member3Name, t.member4Name, t.member5Name].filter(Boolean).map((n: string) => n.trim()).filter((n: string) => n.length > 0);
          currentTeams.push({
            name: t.name,
            track: t.track || 'Coding',
            lead: t.leadName || (roster[0] || 'Student Captain'),
            members: Math.max(roster.length, 3),
            rosterList: roster,
            status: 'In Competition',
            mentor: 'Assigned Coordinator',
            motto: 'National STEM Competition Squad',
            schoolName: req.entity
          });
        });
        this.contentService.saveTeams(currentTeams);
      }

      this.emailService.sendApprovalEmail(req.contact, req.entity + ' Admin', req.entity, req.type, ticket, otp, req.details?.phone || req.details?.repTel);
      alert(`School Registration Approved!\nSchool Admin account created for: ${req.entity}.\nAccess Pass: ${ticket}\nOTP: ${otp}`);
    } else if (req.type === 'Team Addition') {
      const newTeam = {
        name: req.entity,
        track: req.details?.track || 'Robotics',
        lead: req.details?.members?.[0] || 'Team Lead',
        members: req.details?.members?.length || 3,
        status: 'In Competition',
        schoolName: req.details?.school || 'Partner School'
      };
      const currentTeams = [...this.contentService.teams];
      currentTeams.push(newTeam);
      this.contentService.saveTeams(currentTeams);
      
      const stats = { ...this.contentService.platformStats };
      stats.projects += 0.1;
      this.contentService.updatePlatformStats(stats);

      this.emailService.sendApprovalEmail(req.contact, req.entity, req.entity, req.type, 'N/A — Team Added', 'N/A', req.details?.phone);
      alert(`Team Addition Approved!\nTeam "${req.entity}" has been successfully added to competition tracks.`);
    } else if (req.type === 'Instructor Access') {
      const ticket = 'NTIC-INS-' + Math.random().toString(36).substring(2, 6).toUpperCase();
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const newInstructor = {
        id: 'USR-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        role: 'instructor' as const,
        fullName: req.entity,
        email: req.contact,
        phone: req.details?.phone || '+233 24 555 5678',
        otp,
        password: otp,
        organization: req.details?.institution || 'NTIC partner',
        track: req.details?.specialization || 'Coding & AI',
        ticket,
        status: 'Active',
        registeredAt: new Date().toLocaleDateString('en-GB'),
        lastLogin: 'Never'
      };

      const currentUsers = [...this.contentService.users];
      currentUsers.push(newInstructor);
      this.contentService.saveUsers(currentUsers);

      const stats = { ...this.contentService.platformStats };
      stats.mentors += 1;
      this.contentService.updatePlatformStats(stats);

      this.emailService.sendApprovalEmail(req.contact, req.entity, req.entity, req.type, ticket, otp, req.details?.phone);
      alert(`Instructor Access Approved!\nInstructor account created for: ${req.entity}.\nAccess Pass: ${ticket}\nOTP: ${otp}`);
    }

    const currentAudit = [...this.contentService.auditLogs];
    currentAudit.unshift({
      action: `${req.type} approved: ${req.entity}`,
      user: 'admin@ntic.org.gh',
      time: 'Just now',
      type: 'approval'
    });
    this.contentService.saveAuditLogs(currentAudit);

    this.stats = this.stats.map(s =>
      s.icon === 'verified_user'
        ? { ...s, value: String(this.pendingApprovals.length), meta: this.pendingApprovals.length > 0 ? 'Action required' : 'All clear' }
        : s
    );

    this.approvingIds.delete(req.id);
  }

  rejectRequest(req: any): void {
    this.openReview(req);
  }

  getReviewReasons(type: string): string[] {
    if (type === 'School Registration') {
      return [
        'Incomplete accreditation documents',
        'IT lab verification failed',
        'Contact email or phone invalid',
        'Invalid school registry code format'
      ];
    } else if (type === 'Team Addition') {
      return [
        'Student team list missing crucial details',
        'Selected competition track has reached capacity',
        'Project proposal description too vague',
        'Duplicate registration detected'
      ];
    } else {
      return [
        'Incomplete credential certificates',
        'Assigned track/specialization mismatch',
        'Background check pending',
        'Instructor credentials unverified'
      ];
    }
  }

  openPreview(req: any): void {
    this.activePreviewRequest = req;
  }

  openReview(req: any): void {
    this.activeReviewRequest = req;
    this.reviewReasons = this.getReviewReasons(req.type);
    this.selectedReasons = {};
    this.rejectionNotes = '';
  }

  submitRejection(): void {
    if (!this.activeReviewRequest) return;
    
    const reasons = Object.keys(this.selectedReasons)
      .filter(k => this.selectedReasons[k])
      .join(', ');
      
    const logDetails = reasons 
      ? `Reasons: ${reasons}.${this.rejectionNotes ? ' Note: ' + this.rejectionNotes : ''}`
      : (this.rejectionNotes || 'No specific reason provided');

    const rejected = {
      ...this.activeReviewRequest,
      reviewedAt: new Date().toLocaleString('en-GB'),
      reviewer: 'admin@ntic.org.gh',
      rejectionReasons: reasons || 'No specific reason provided',
      rejectionNotes: this.rejectionNotes || ''
    };

    const currentRejected = [...this.contentService.rejectedApprovals];
    currentRejected.unshift(rejected);
    this.contentService.saveRejectedApprovals(currentRejected);

    this.pendingApprovals = this.pendingApprovals.filter(r => r.id !== this.activeReviewRequest.id);

    this.emailService.sendRejectionEmail(
      this.activeReviewRequest.contact,
      this.activeReviewRequest.entity,
      this.activeReviewRequest.entity,
      this.activeReviewRequest.type,
      reasons || 'No specific reason provided',
      this.rejectionNotes || '',
      this.activeReviewRequest.details?.phone || this.activeReviewRequest.details?.repTel
    );
    
    const currentAudit = [...this.contentService.auditLogs];
    currentAudit.unshift({
      action: `${this.activeReviewRequest.type} rejected: ${this.activeReviewRequest.entity} (${logDetails})`,
      user: 'admin@ntic.org.gh',
      time: 'Just now',
      type: 'system'
    });
    this.contentService.saveAuditLogs(currentAudit);
    
    this.stats = this.stats.map(s =>
      s.icon === 'verified_user'
        ? { ...s, value: String(this.pendingApprovals.length), meta: this.pendingApprovals.length > 0 ? 'Action required' : 'All clear' }
        : s
    );
    
    this.activeReviewRequest = null;
  }

  closePreview(): void {
    this.activePreviewRequest = null;
  }

  closeReview(): void {
    this.activeReviewRequest = null;
  }

  async viewDocument(docName: string, schoolName: string): Promise<void> {
    const fileId = docName.includes('::') ? docName.split('::')[0] : null;
    if (fileId) {
      const url = await this.fileStorage.getUrl(fileId);
      if (url) window.open(url, '_blank');
    }
  }

  closeDocument(): void {
    this.activeDocumentName = null;
    this.activeDocumentType = null;
  }

  closeTicketModal(): void {
    this.viewTicketUser = null;
  }

  /* ── Admin Management ────────────────────────────────── */
  openAdminModal(admin?: any): void {
    this.editingAdmin = admin || null;
    this.adminError = '';
    this.adminSuccess = '';
    this.adminForm = admin ? { ...admin } : {
      fullName: '', email: '', phone: '', role: 'content_manager', organization: 'NTIC'
    };
    this.isAdminModalOpen = true;
  }

  closeAdminModal(): void {
    this.isAdminModalOpen = false;
    this.editingAdmin = null;
    this.adminForm = {};
  }

  saveAdminUser(): void {
    if (!this.adminForm.fullName || !this.adminForm.email) {
      this.adminError = 'Name and email are required.';
      return;
    }

    if (this.editingAdmin) {
      const users = [...this.contentService.users];
      const idx = users.findIndex(u => u.id === this.editingAdmin.id);
      if (idx > -1) {
        users[idx] = { ...users[idx], ...this.adminForm };
        this.contentService.saveUsers(users);
      }
    } else {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const newUser = {
        id: `USR-${String(this.contentService.users.length + 1).padStart(3, '0')}`,
        role: this.adminForm.role,
        fullName: this.adminForm.fullName,
        email: this.adminForm.email,
        phone: this.adminForm.phone || '+233 24 000 0000',
        otp,
        password: otp,
        organization: this.adminForm.organization || 'NTIC',
        ticket: `NTIC-ADM-${Math.floor(1000 + Math.random() * 9000)}`,
        status: 'Active',
        registeredAt: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        lastLogin: 'Never'
      };
      const currentUsers = [...this.contentService.users];
      currentUsers.unshift(newUser);
      this.contentService.saveUsers(currentUsers);

      this.addAuditLog({ action: `Created ${this.adminForm.role} account: ${this.adminForm.fullName} (${this.adminForm.email})`, type: 'approval' });
      this.closeAdminModal();
      this.showTicketModal(newUser);
      return;
    }

    this.adminSuccess = 'Admin saved successfully.';
    setTimeout(() => { this.closeAdminModal(); }, 1200);
  }

  confirmDeleteAdmin(admin: any): void {
    this.deleteConfirmAdmin = admin;
  }

  deleteAdminUser(): void {
    if (!this.deleteConfirmAdmin) return;
    const users = this.contentService.users.filter(u => u.id !== this.deleteConfirmAdmin.id);
    this.contentService.saveUsers(users);
    this.addAuditLog({ action: `Removed admin: ${this.deleteConfirmAdmin.fullName} (${this.deleteConfirmAdmin.role})`, type: 'revoked' });
    this.deleteConfirmAdmin = null;
  }

  cancelDeleteAdmin(): void {
    this.deleteConfirmAdmin = null;
  }

  getAdminRoleLabel(role: string): string {
    const labels: Record<string, string> = {
      super_admin: 'Super Admin', content_manager: 'Content Manager', reviewer: 'Reviewer',
      competition_manager: 'Competition Manager'
    };
    return labels[role] || role;
  }

  getInitials(fullName: string): string {
    return fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  }

  getNodeLatency(i: number): number {
    return this.nodeLive[i] ? this.nodeLive[i].latencyMs : 0;
  }

  getNodeLoad(i: number): number {
    return this.nodeLive[i] ? this.nodeLive[i].loadPct : 0;
  }

  // ── CONTENT MANAGER ACTIONS ──────────────────────────────────

  // Stories
  openStoryForm(): void {
    this.editingStoryId = null;
    this.storyForm = { tag: 'Robotics', tagColor: '', image: '', date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), readTime: '5 min read', title: '', body: '' };
    this.storyFormError = '';
    this.storyFormOpen = true;
  }
  
  openEditStoryForm(story: any): void {
    this.editingStoryId = story.id;
    this.storyForm = {
      tag: story.tag,
      tagColor: story.tagColor,
      image: story.image,
      date: story.date,
      readTime: story.readTime,
      title: story.title,
      body: story.body
    };
    this.storyFormError = '';
    this.storyFormOpen = true;
  }

  onStoryImageSelected(event: any): void {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.storyForm.image = e.target.result; // base64 string
      };
      reader.readAsDataURL(file);
    }
  }

  closeStoryForm(): void { this.storyFormOpen = false; }
  
  submitStoryForm(): void {
    if (!this.storyForm.title || !this.storyForm.body) {
      this.storyFormError = 'Title and body are required.';
      return;
    }
    if (!this.storyForm.image) {
      this.storyForm.image = 'assets/ntic_image_1.jpeg'; // fallback
    }
    
    if (this.editingStoryId) {
      this.contentService.updateStory({ id: this.editingStoryId, ...this.storyForm });
      this.addAuditLog({ action: `Championship Story updated: "${this.storyForm.title.slice(0, 40)}..."`, user: 'admin@ntic.org.gh', time: 'Just now', type: 'system' });
    } else {
      this.contentService.addStory({ ...this.storyForm });
      this.addAuditLog({ action: `Championship Story added: "${this.storyForm.title.slice(0, 40)}..."`, user: 'admin@ntic.org.gh', time: 'Just now', type: 'system' });
    }
    this.storyFormOpen = false;
  }

  removeStory(id: string): void {
    this.contentService.removeStory(id);
    this.addAuditLog({ action: `Championship Story removed (ID: ${id})`, user: 'admin@ntic.org.gh', time: 'Just now', type: 'system' });
  }

  // ── Slideshow Management ──────────────────────────────
  slideFormOpen = false;
  editingSlideId: string | null = null;
  slideForm: any = { title: '', image: '', videoFileId: '', videoUrl: '' };
  slideSavedFields: Record<string, boolean> = {};

  addSlide(): void {
    this.editingSlideId = null;
    this.slideForm = {
      title: '', image: '', videoFileId: '', videoUrl: '',
      tag: 'National Championship',
      description: 'Bringing together high school teams from all 16 regions to solve real-world problems through Coding, Robotics, AI, Cybersecurity, and Open Innovation.',
      ctaText: 'Enter Portal',
      ctaLink: '#portal'
    };
    this.slideFormOpen = true;
  }

  editSlide(slide: any): void {
    this.editingSlideId = slide.id;
    this.slideForm = { ...slide };
    this.slideFormOpen = true;
  }

  closeSlideForm(): void { this.slideFormOpen = false; }

  maximizeContent(tab: string): void {
    this.contentTab = tab as any;
    this.maximizedContentTab = tab;
  }

  exitMaximize(): void {
    this.maximizedContentTab = null;
  }

  async onSlideVideoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const id = `slide-video-${Date.now()}`;
      await this.fileStorage.store(id, file);
      this.slideForm.videoFileId = id;
      this.slideForm.videoThumbnail = await this.captureVideoThumbnail(file);
    }
  }

  private captureVideoThumbnail(file: File): Promise<string> {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      const url = URL.createObjectURL(file);
      video.src = url;
      video.onloadeddata = () => {
        video.currentTime = Math.min(1, video.duration / 3);
      };
      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 180;
        canvas.getContext('2d')!.drawImage(video, 0, 0, 320, 180);
        const thumb = canvas.toDataURL('image/jpeg', 0.7);
        URL.revokeObjectURL(url);
        resolve(thumb);
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve('');
      };
    });
  }

  onSlideImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.slideForm.image = e.target.result;
      };
      reader.readAsDataURL(input.files[0]);
    }
  }

  saveSlide(): void {
    if (!this.slideForm.title && !this.slideForm.image && !this.slideForm.videoFileId && !this.slideForm.videoUrl) return;
    const slides = [...this.contentService.heroSlides];
    const saved = {
      ...this.slideForm,
      tag: this.slideForm.tag || 'National Championship',
      description: this.slideForm.description || 'Bringing together high school teams from all 16 regions to solve real-world problems through Coding, Robotics, AI, Cybersecurity, and Open Innovation.',
      ctaText: this.slideForm.ctaText || 'Enter Portal',
      ctaLink: this.slideForm.ctaLink || '#portal'
    };
    if (this.editingSlideId) {
      const idx = slides.findIndex(s => s.id === this.editingSlideId);
      if (idx > -1) slides[idx] = { ...slides[idx], ...saved };
      this.addAuditLog({ action: `Slide updated: "${(this.slideForm.title || 'Untitled').slice(0, 40)}"`, user: 'admin@ntic.org.gh', time: 'Just now', type: 'system' });
    } else {
      slides.push({ id: `slide-${Date.now()}`, ...saved });
      this.addAuditLog({ action: `Slide added: "${(this.slideForm.title || 'Untitled').slice(0, 40)}"`, user: 'admin@ntic.org.gh', time: 'Just now', type: 'system' });
    }
    this.contentService.saveHeroSlides(slides);
    this.slideFormOpen = false;
  }

  saveSlideField(field: string): void {
    if (!this.editingSlideId) return;
    const slides = [...this.contentService.heroSlides];
    const idx = slides.findIndex(s => s.id === this.editingSlideId);
    if (idx === -1) return;
    slides[idx] = { ...slides[idx], [field]: this.slideForm[field] };
    this.contentService.saveHeroSlides(slides);
    const fieldNames: Record<string, string> = { title: 'Title', description: 'Description', tag: 'Tag', ctaText: 'CTA Text', ctaLink: 'CTA Link' };
    this.slideSavedFields[field] = true;
    setTimeout(() => { this.slideSavedFields[field] = false; }, 1500);
    this.addAuditLog({ action: `Slide field saved: ${fieldNames[field] || field}`, user: 'admin@ntic.org.gh', time: 'Just now', type: 'system' });
  }

  deleteSlide(slide: any): void {
    const slides = this.contentService.heroSlides.filter(s => s.id !== slide.id);
    this.contentService.saveHeroSlides(slides);
    this.addAuditLog({ action: `Slide deleted: "${slide.title}"`, user: 'admin@ntic.org.gh', time: 'Just now', type: 'system' });
  }

  moveSlideUp(index: number): void {
    if (index <= 0) return;
    const slides = [...this.contentService.heroSlides];
    [slides[index - 1], slides[index]] = [slides[index], slides[index - 1]];
    this.contentService.saveHeroSlides(slides);
  }

  moveSlideDown(index: number): void {
    const slides = [...this.contentService.heroSlides];
    if (index >= slides.length - 1) return;
    [slides[index], slides[index + 1]] = [slides[index + 1], slides[index]];
    this.contentService.saveHeroSlides(slides);
  }

  // Hall of Fame
  openHofForm(): void {
    this.editingHofId = null;
    const defaultExpiry = new Date();
    defaultExpiry.setFullYear(defaultExpiry.getFullYear() + 1);
    const expiryStr = defaultExpiry.toISOString().split('T')[0];
    
    this.hofForm = {
      initials: '',
      name: '',
      school: '',
      year: new Date().getFullYear().toString(),
      badge: '',
      trackClass: 'coding-track',
      expiryDate: expiryStr
    };
    this.hofFormError = '';
    this.hofFormOpen = true;
  }
  
  openEditHofForm(entry: any): void {
    this.editingHofId = entry.id;
    this.hofForm = {
      initials: entry.initials,
      name: entry.name,
      school: entry.school,
      year: entry.year,
      badge: entry.badge,
      trackClass: entry.trackClass,
      expiryDate: entry.expiryDate || ''
    };
    this.hofFormError = '';
    this.hofFormOpen = true;
  }

  isEntryExpired(entry: any): boolean {
    if (!entry.expiryDate) return false;
    const today = new Date().toISOString().split('T')[0];
    return entry.expiryDate < today;
  }

  closeHofForm(): void { this.hofFormOpen = false; }
  
  submitHofForm(): void {
    if (!this.hofForm.name || !this.hofForm.school || !this.hofForm.badge) {
      this.hofFormError = 'Name, school, and badge/title are required.';
      return;
    }
    if (!this.hofForm.initials) {
      this.hofForm.initials = this.getInitials(this.hofForm.name);
    }
    
    if (this.editingHofId) {
      this.contentService.updateHofEntry({ id: this.editingHofId, ...this.hofForm });
      this.addAuditLog({ action: `Hall of Fame entry updated: ${this.hofForm.name}`, user: 'admin@ntic.org.gh', time: 'Just now', type: 'system' });
    } else {
      this.contentService.addHofEntry({ ...this.hofForm });
      this.addAuditLog({ action: `Hall of Fame entry added: ${this.hofForm.name}`, user: 'admin@ntic.org.gh', time: 'Just now', type: 'system' });
    }
    this.hofFormOpen = false;
  }
  
  removeHofEntry(id: string): void {
    this.contentService.removeHofEntry(id);
    this.addAuditLog({ action: `Hall of Fame entry removed (ID: ${id})`, user: 'admin@ntic.org.gh', time: 'Just now', type: 'system' });
  }

  // Leaderboard
  openLbForm(entry?: LeaderboardEntry): void {
    if (entry) {
      this.lbEditId = entry.id;
      this.lbForm = {
        rank: entry.rank,
        schoolName: entry.schoolName,
        location: entry.location,
        region: entry.region,
        points: entry.points,
        trackPoints: { ...entry.trackPoints }
      };
    } else {
      this.lbEditId = null;
      this.lbForm = { rank: '', schoolName: '', location: '', region: '', points: 0, trackPoints: { all: 0, coding: 0, robotics: 0, ai: 0, cyber: 0 } };
    }
    this.lbFormError = '';
    this.lbFormOpen = true;
  }
  closeLbForm(): void { this.lbFormOpen = false; this.lbEditId = null; }
  onLbTrackChange(): void {
    const tp = this.lbForm.trackPoints;
    tp.all = (tp.coding || 0) + (tp.robotics || 0) + (tp.ai || 0) + (tp.cyber || 0);
    this.lbForm.points = tp.all;
  }
  submitLbForm(): void {
    if (!this.lbForm.schoolName || !this.lbForm.location) {
      this.lbFormError = 'School name and location are required.';
      return;
    }
    this.onLbTrackChange(); // recalc total
    if (this.lbEditId) {
      this.contentService.updateLeaderboardEntry(this.lbEditId, { ...this.lbForm });
      this.addAuditLog({ action: `Leaderboard updated: ${this.lbForm.schoolName}`, user: 'admin@ntic.org.gh', time: 'Just now', type: 'system' });
    } else {
      this.contentService.addLeaderboardEntry({ ...this.lbForm });
      this.addAuditLog({ action: `Leaderboard entry added: ${this.lbForm.schoolName}`, user: 'admin@ntic.org.gh', time: 'Just now', type: 'system' });
    }
    this.lbFormOpen = false;
    this.lbEditId = null;
  }
  removeLbEntry(id: string): void {
    this.contentService.removeLeaderboardEntry(id);
    this.addAuditLog({ action: `Leaderboard entry removed (ID: ${id})`, user: 'admin@ntic.org.gh', time: 'Just now', type: 'system' });
  }

  // Talent Discovery
  openTdForm(entry?: TalentDiscovery): void {
    if (entry) {
      this.tdEditId = entry.id;
      this.tdForm = {
        category: entry.category,
        studentName: entry.studentName,
        schoolAndGrade: entry.schoolAndGrade,
        score: entry.score,
        badgeColor: entry.badgeColor || 'primary'
      };
    } else {
      this.tdEditId = null;
      this.tdForm = {
        category: 'Algorithm Design',
        studentName: '',
        schoolAndGrade: '',
        score: '',
        badgeColor: 'primary'
      };
    }
    this.tdFormError = '';
    this.tdFormOpen = true;
  }

  closeTdForm(): void {
    this.tdFormOpen = false;
    this.tdEditId = null;
  }

  submitTdForm(): void {
    if (!this.tdForm.studentName || !this.tdForm.category || !this.tdForm.schoolAndGrade || !this.tdForm.score) {
      this.tdFormError = 'All fields are required.';
      return;
    }
    if (this.tdEditId) {
      this.contentService.updateTalentDiscovery(this.tdEditId, { ...this.tdForm });
      this.addAuditLog({ action: `Talent Discovery entry updated for ${this.tdForm.studentName}`, user: 'admin@ntic.org.gh', time: 'Just now', type: 'system' });
    } else {
      this.contentService.addTalentDiscovery({ ...this.tdForm });
      this.addAuditLog({ action: `Talent Discovery entry added for ${this.tdForm.studentName}`, user: 'admin@ntic.org.gh', time: 'Just now', type: 'system' });
    }
    this.tdFormOpen = false;
    this.tdEditId = null;
  }

  removeTdEntry(id: string): void {
    this.contentService.removeTalentDiscovery(id);
    this.addAuditLog({ action: `Talent Discovery entry removed (ID: ${id})`, user: 'admin@ntic.org.gh', time: 'Just now', type: 'system' });
  }

  // Platform Stats
  openStatsEdit(): void {
    this.statsForm = { ...this.contentService.platformStats };
    this.statsEditMode = true;
  }
  saveStats(): void {
    this.contentService.updatePlatformStats({ ...this.statsForm });
    this.statsEditMode = false;
    this.addAuditLog({ action: 'Platform impact stats updated', user: 'admin@ntic.org.gh', time: 'Just now', type: 'system' });
  }

  clearAllData(): void {
    if (confirm('Are you sure you want to clear all data and start with a clean slate? This will reset all portals.')) {
      this.contentService.clearAllData();
      alert('All data wiped! You are now in a clean testing state.');
      this.loadDashboardData();
    }
  }

  loadSampleData(): void {
    if (confirm('Are you sure you want to restore the original sample data? This will overwrite your current test inputs.')) {
      this.contentService.loadSampleData();
      alert('Sample data restored successfully!');
      this.loadDashboardData();
    }
  }

  saveCountdown(): void {
    if (!this.countdownInput) return;
    // Format: YYYY-MM-DDThh:mm:ss
    let dateStr = this.countdownInput;
    if (dateStr.length === 16) {
      dateStr += ':00';
    }
    this.contentService.updateCountdownDate(dateStr);
    this.addAuditLog({ action: `Countdown target date updated to ${dateStr}`, user: 'admin@ntic.org.gh', time: 'Just now', type: 'system' });
  }

  updatePreviewCountdown(): void {
    if (!this.countdownInput) {
      this.previewDays = this.previewHours = this.previewMins = this.previewSecs = 0;
      return;
    }
    const target = new Date(this.countdownInput).getTime();
    const now = new Date().getTime();
    const dist = target - now;
    if (dist <= 0) {
      this.previewDays = this.previewHours = this.previewMins = this.previewSecs = 0;
      return;
    }
    this.previewDays = Math.floor(dist / (1000 * 60 * 60 * 24));
    this.previewHours = Math.floor((dist % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    this.previewMins = Math.floor((dist % (1000 * 60 * 60)) / (1000 * 60));
    this.previewSecs = Math.floor((dist % (1000 * 60)) / 1000);
  }

  // News Feed
  openNewsForm(): void {
    this.editingNewsId = null;
    this.newsForm = { headline: '', tag: 'Announcement', date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), link: '#' };
    this.newsFormError = '';
    this.newsFormOpen = true;
  }

  openEditNewsForm(item: any): void {
    this.editingNewsId = item.id;
    this.newsForm = {
      headline: item.headline,
      tag: item.tag,
      date: item.date,
      link: item.link
    };
    this.newsFormError = '';
    this.newsFormOpen = true;
  }

  closeNewsForm(): void { this.newsFormOpen = false; }
  
  submitNewsForm(): void {
    if (!this.newsForm.headline) {
      this.newsFormError = 'Headline is required.';
      return;
    }
    
    if (this.editingNewsId) {
      this.contentService.updateNewsItem({ id: this.editingNewsId, ...this.newsForm });
      this.addAuditLog({ action: `News item updated: "${this.newsForm.headline.slice(0, 40)}"`, user: 'admin@ntic.org.gh', time: 'Just now', type: 'system' });
    } else {
      this.contentService.addNewsItem({ ...this.newsForm });
      this.addAuditLog({ action: `News item published: "${this.newsForm.headline.slice(0, 40)}"`, user: 'admin@ntic.org.gh', time: 'Just now', type: 'system' });
    }
    this.newsFormOpen = false;
  }

  removeNewsItem(id: string): void {
    this.contentService.removeNewsItem(id);
    this.addAuditLog({ action: `News item removed (ID: ${id})`, user: 'admin@ntic.org.gh', time: 'Just now', type: 'system' });
  }

  trackClass_options = [
    { value: 'coding-track', label: '⚡ Coding' },
    { value: 'robotics-track', label: '🤖 Robotics' },
    { value: 'ai-track', label: '🧠 AI & ML' },
    { value: 'cyber-track', label: '🔐 Cybersecurity' },
    { value: 'innovation-track', label: '💡 Innovation' }
  ];

  tag_colors = [
    { value: '', label: 'Default (Robotics)' },
    { value: 'coding', label: 'Coding (Blue)' },
    { value: 'cyber', label: 'Cyber (Red)' },
    { value: 'ai', label: 'AI (Purple)' },
    { value: 'innovation', label: 'Innovation (Orange)' }
  ];

  // ── LIVE TELEMETRY ENGINE ────────────────────────────────
  startLiveTelemetry(): void {
    const updateTime = () => {
      const now = new Date();
      this.liveTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      this.updatePreviewCountdown();
    };
    updateTime();
    this.liveIntervals.push(setInterval(updateTime, 1000));

    this.liveIntervals.push(setInterval(() => {
      this.nodeLive = this.nodeLive.map((node, i) => {
        const jitterLatency = Math.round(node.latencyMs + (Math.random() * 10 - 5));
        const jitterLoad   = Math.max(1, Math.min(95, Math.round(node.loadPct + (Math.random() * 6 - 3))));
        this.nodeHistory[i] = [...this.nodeHistory[i].slice(-19), jitterLoad];
        return { latencyMs: jitterLatency, loadPct: jitterLoad };
      });
    }, 2000));

    // ── Real audit trail: only actual admin actions are captured ──
  }

  // ── SPARKLINE SVG PATH GENERATOR ────────────────────────
  sparklinePath(history: number[]): string {
    if (!history || history.length < 2) return '';
    const w = 80, h = 28;
    const max = Math.max(...history, 1);
    const points = history.map((v, i) => {
      const x = (i / (history.length - 1)) * w;
      const y = h - (v / max) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M ${points.join(' L ')}`;
  }

  // ── SCHOOL ADMIN PORTAL GETTERS & CRUD ───────────────────
  editingTeamOriginalName: string | null = null;

  get schoolAdminStats(): any[] {
    if (this.activeRoleId !== 'school_admin') return this.stats;
    const myTeams = this.schoolTeams;
    const teamsCount = myTeams.length;
    const studentsCount = myTeams.reduce((acc, t) => acc + (t.rosterList?.length || Number(t.members) || 0), 0);
    const uniqueMentors = new Set(myTeams.map(t => t.mentor || t.coach).filter(Boolean)).size;
    const mentorsCount = uniqueMentors > 0 ? uniqueMentors : (teamsCount > 0 ? 1 : 0);
    
    return [
      { label: 'Registered Students', value: studentsCount.toString(), icon: 'group', meta: `Across ${teamsCount} team${teamsCount === 1 ? '' : 's'}`, color: 'primary' },
      { label: 'Active Mentors', value: mentorsCount.toString(), icon: 'co_present', meta: mentorsCount > 0 ? 'Fully assigned' : 'No mentors assigned', color: 'secondary' },
      { label: 'Average Score', value: teamsCount > 0 ? '84.5%' : '-', icon: 'percent', meta: teamsCount > 0 ? 'Active Tournament Average' : 'No scores yet', color: 'tertiary' },
      { label: 'Regional Rank', value: teamsCount > 0 ? '#3' : 'Unranked', icon: 'workspace_premium', meta: teamsCount > 0 ? 'National Qualifier Bracket' : 'Pending participation', color: 'error' }
    ];
  }

  get schoolTeams(): any[] {
    if (!this.schoolName) return [];
    const cleanSchoolName = this.schoolName.trim().toLowerCase();
    const myTeams = this.contentService.teams.filter(t => {
      const cleanTeamSchool = (t.schoolName || '').trim().toLowerCase();
      return cleanTeamSchool === cleanSchoolName || cleanTeamSchool.includes(cleanSchoolName) || cleanSchoolName.includes(cleanTeamSchool);
    });
    
    // If no teams found in active registry, check pending approvals to restore any custom teams created during school/team registration
    if (myTeams.length === 0) {
      const restoredTeams: any[] = [];
      this.contentService.pendingApprovals.forEach(req => {
        const cleanReqSchool = (req.entity || req.details?.school || '').trim().toLowerCase();
        if (cleanReqSchool === cleanSchoolName || cleanReqSchool.includes(cleanSchoolName) || cleanSchoolName.includes(cleanReqSchool)) {
          if (req.details?.teamsList && Array.isArray(req.details.teamsList)) {
            req.details.teamsList.forEach((t: any) => {
              const roster = [t.leadName, t.member2Name, t.member3Name, t.member4Name, t.member5Name].filter(Boolean).map((n: string) => n.trim()).filter((n: string) => n.length > 0);
              restoredTeams.push({
                name: t.name,
                track: t.track || 'Coding',
                lead: t.leadName || (roster[0] || 'Student Captain'),
                members: Math.max(roster.length, 3),
                rosterList: roster,
                status: 'In Competition',
                mentor: 'Assigned Coordinator',
                motto: 'National STEM Competition Squad',
                schoolName: this.schoolName
              });
            });
          } else if (req.type === 'Team Addition') {
            restoredTeams.push({
              name: req.entity,
              track: req.details?.track || 'Coding',
              lead: req.details?.members?.[0] || 'Student Captain',
              members: req.details?.members?.length || 4,
              rosterList: req.details?.members || ['Student Captain', 'Member 2', 'Member 3'],
              status: 'In Competition',
              mentor: 'Assigned Coordinator',
              motto: 'Sandbox Innovation Project',
              schoolName: this.schoolName
            });
          }
        }
      });

      if (restoredTeams.length > 0) {
        const current = [...this.contentService.teams, ...restoredTeams];
        this.contentService.saveTeams(current);
        return restoredTeams;
      }
      return [];
    }
    return myTeams;
  }

  get schoolInstructors(): any[] {
    if (!this.schoolName) return [];
    return this.contentService.users.filter(u => 
      u.role === 'instructor' &&
      u.organization?.trim().toLowerCase() === this.schoolName.trim().toLowerCase()
    );
  }

  get additionalMemberIndices(): number[] {
    const count = Math.max(0, (this.teamForm.members || 1) - 1);
    return Array.from({ length: count }, (_, i) => i);
  }

  onSelectSize(size: number): void {
    this.teamForm.members = size;
  }

  openAddTeamModal(): void {
    this.editingTeamOriginalName = null;
    this.teamForm = { name: '', track: 'Coding', lead: '', members: 4, mentor: '', motto: '', memberNames: ['', '', '', '', '', '', '', ''] };
    this.isAddTeamModalOpen = true;
  }

  editTeam(team: any): void {
    this.editingTeamOriginalName = team.name;
    const roster = team.rosterList || [team.lead];
    const namesArray = ['', '', '', '', '', '', '', ''];
    for (let i = 1; i < roster.length && i <= 8; i++) {
      namesArray[i - 1] = roster[i];
    }

    this.teamForm = {
      name: team.name,
      track: team.track || 'Coding',
      lead: team.lead || (roster[0] || ''),
      members: team.members || roster.length || 4,
      mentor: team.mentor || '',
      motto: team.motto || '',
      memberNames: namesArray
    };
    this.isAddTeamModalOpen = true;
  }

  disbandTeam(team: any): void {
    if (confirm(`Are you sure you want to disband squad "${team.name}" and remove all registered student members from the tournament?`)) {
      const currentTeams = this.contentService.teams.filter(t => t !== team && t.name !== team.name);
      this.contentService.saveTeams(currentTeams);
      this.addAuditLog({
        action: `School Admin (${this.schoolName}) disbanded squad: ${team.name}`,
        user: localStorage.getItem('activeUserEmail') || 'School Admin',
        time: 'Just now',
        type: 'approval'
      });
    }
  }

  closeAddTeamModal(): void {
    this.isAddTeamModalOpen = false;
    this.editingTeamOriginalName = null;
    if (this.route.snapshot.queryParams['action'] === 'add_team') {
      this.router.navigate([], { relativeTo: this.route, queryParams: { action: null }, queryParamsHandling: 'merge' });
    }
  }

  submitAddTeam(): void {
    if (!this.teamForm.name.trim() || !this.teamForm.lead.trim()) return;

    const activeMembersList = [
      this.teamForm.lead.trim(),
      ...this.teamForm.memberNames
        .slice(0, (this.teamForm.members || 1) - 1)
        .map(name => name.trim())
        .filter(name => name.length > 0)
    ];

    const newTeam: any = {
      name: this.teamForm.name.trim(),
      track: this.teamForm.track,
      lead: this.teamForm.lead.trim(),
      members: Math.max(this.teamForm.members || 4, activeMembersList.length),
      rosterList: activeMembersList,
      mentor: this.teamForm.mentor || 'Assigned Coordinator',
      motto: this.teamForm.motto ? this.teamForm.motto.trim() : '',
      status: 'In Competition',
      schoolName: this.schoolName
    };

    const currentTeams = [...this.contentService.teams];
    if (this.editingTeamOriginalName) {
      const idx = currentTeams.findIndex(t => t.name === this.editingTeamOriginalName && t.schoolName === this.schoolName);
      if (idx !== -1) {
        currentTeams[idx] = newTeam;
      } else {
        currentTeams.push(newTeam);
      }
      this.editingTeamOriginalName = null;
    } else {
      currentTeams.push(newTeam);
    }
    this.contentService.saveTeams(currentTeams);

    // Add audit log
    const currentAudit = [...this.contentService.auditLogs];
    currentAudit.unshift({
      action: `School Admin (${this.schoolName}) registered/updated Team: ${newTeam.name} under ${newTeam.track}`,
      user: localStorage.getItem('activeUserEmail') || 'School Admin',
      time: 'Just now',
      type: 'approval'
    });
    this.contentService.saveAuditLogs(currentAudit);

    this.closeAddTeamModal();
  }

  getRoleLabel(role: string): string {
    if (!role) return 'User';
    const r = role.toLowerCase();
    if (r === 'judge') return 'Judge';
    if (r === 'sponsor') return 'Sponsor';
    if (r === 'school_admin' || r === 'school') return 'School Admin';
    if (r === 'instructor' || r === 'mentor') return 'Instructor';
    if (r === 'student') return 'Student';
    if (r === 'super_admin' || r === 'admin') return 'Super Admin';
    if (r === 'content_manager') return 'Content Manager';
    if (r === 'reviewer') return 'Reviewer';
    if (r === 'competition_manager') return 'Competition Manager';
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  getRoleIcon(role: string): string {
    if (!role) return 'person';
    const r = role.toLowerCase();
    if (r === 'judge') return 'gavel';
    if (r === 'sponsor') return 'handshake';
    if (r === 'school_admin' || r === 'school') return 'school';
    if (r === 'instructor' || r === 'mentor') return 'assignment_ind';
    if (r === 'student') return 'person';
    if (r === 'super_admin' || r === 'admin') return 'admin_panel_settings';
    if (r === 'competition_manager') return 'emoji_events';
    return 'badge';
  }
}
