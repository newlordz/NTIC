import { getAuthValue } from '../../services/session.util';
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  ContentService,
  ChampionshipStory,
  HallOfFameEntry,
  LeaderboardEntry,
  NewsFeedItem,
  TalentDiscovery,
  UpcomingEvent
} from '../../services/content.service';
import { BrevoEmailService } from '../../services/brevo-email.service';
import { FileStorageService } from '../../services/file-storage.service';
import { DialogService } from '../../services/dialog.service';
import { ApiService } from '../../services/api.service';
import { TimeAgoPipe } from '../../services/time-ago.pipe';
import { LmsManagerComponent } from '../lms-manager/lms-manager.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, TimeAgoPipe, LmsManagerComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, OnDestroy {
  activeRoleId = 'super_admin';
  dashboardTitle = 'Dashboard';
  dashboardSubtitle = 'NTIC Platform Portal';
  currentUser: any = null;

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
  adminTab: 'overview' | 'control' | 'register' | 'tickets' | 'approvals' | 'content' | 'users' | 'admins' | 'lms' | 'database' = 'overview';
  adminSubTab: 'tickets' | 'approvals' | 'content' | 'users' | 'admins' | '' = '';

  goToTab(tab: string): void {
    this.adminTab = tab as any;
    this.adminSubTab = '';
    this.router.navigate([], { relativeTo: this.route, queryParams: { tab }, queryParamsHandling: 'merge' });
  }

  goToSubTab(sub: string): void {
    this.adminSubTab = sub as any;
    this.router.navigate([], { relativeTo: this.route, queryParams: { subtab: sub }, queryParamsHandling: 'merge' });
  }
  private _expandedSection = false;
  get expandedSection(): boolean { return this._expandedSection; }
  set expandedSection(v: boolean) {
    this._expandedSection = v;
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('ac-expanded', v);
    }
  }
  lmsSubTab: 'courses' | 'modules' | 'materials' | 'assignments' = 'courses';
  lmsFormMode: 'add' | 'edit' = 'add';
  editingLmsCourse: any = null;
  editingLmsModule: any = null;
  editingLmsMaterial: any = null;
  editingLmsAssignment: any = null;
  registerRole: 'judge' | 'sponsor' = 'judge';

  setRegisterRole(role: 'judge' | 'sponsor'): void {
    this.registerRole = role;
    this.regForm = { fullName: '', email: '', organization: '', phone: '', track: '', tracks: [], tier: '', notes: '' };
    this.selectedAdminPackages = [];
    this.removeAdminRegLogo();
    this.regError = '';
    this.clearValidation();
    this.generatePreviewTicket();
  }

  clearValidation(): void {
    this.emailValid = null;
    this.emailMessage = '';
    this.phoneValid = null;
    this.phoneMessage = '';
  }

  generatePreviewTicket(): void {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    this.regPreviewTicket = code;
  }

  validateEmail(): void {
    const email = this.regForm.email.trim();
    if (!email) { this.emailValid = null; this.emailMessage = ''; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.emailValid = false;
      this.emailMessage = 'Invalid email format';
      return;
    }
    if (this.contentService.users.some(u => u.email?.trim().toLowerCase() === email.toLowerCase())) {
      this.emailValid = false;
      this.emailMessage = 'Email already registered';
      return;
    }
    this.emailValid = true;
    this.emailMessage = 'Email available';
  }

  validatePhone(): void {
    const phone = this.regForm.phone.trim();
    if (!phone) { this.phoneValid = null; this.phoneMessage = ''; return; }
    if (/^\+?[0-9]{8,15}$/.test(phone.replace(/[\s\-\(\)]/g, ''))) {
      this.phoneValid = true;
      this.phoneMessage = 'Valid phone number';
    } else {
      this.phoneValid = false;
      this.phoneMessage = 'Invalid phone number (8-15 digits)';
    }
  }
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

  // ─── CUSTOM POPUP MODALS ──────────────────────
  credentialsModal: {
    isOpen: boolean;
    title: string;
    subtitle: string;
    accessPass: string;
    pin: string;
    extraInfo?: string;
    nextRoute?: string;
    copiedPass: boolean;
    copiedPin: boolean;
    copiedAll: boolean;
  } | null = null;

  customAlertModal: {
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'warning' | 'info' | 'error';
  } | null = null;

  openCredentialsModal(title: string, subtitle: string, accessPass: string, pin: string, extraInfo?: string, nextRoute?: string) {
    this.credentialsModal = {
      isOpen: true,
      title,
      subtitle,
      accessPass,
      pin,
      extraInfo,
      nextRoute,
      copiedPass: false,
      copiedPin: false,
      copiedAll: false
    };
  }

  copyModalText(type: 'pass' | 'pin' | 'all') {
    if (!this.credentialsModal) return;
    let textToCopy = '';
    if (type === 'pass') {
      textToCopy = this.credentialsModal.accessPass;
      this.credentialsModal.copiedPass = true;
      setTimeout(() => { if (this.credentialsModal) this.credentialsModal.copiedPass = false; }, 2500);
    } else if (type === 'pin') {
      textToCopy = this.credentialsModal.pin;
      this.credentialsModal.copiedPin = true;
      setTimeout(() => { if (this.credentialsModal) this.credentialsModal.copiedPin = false; }, 2500);
    } else if (type === 'all') {
      textToCopy = `Access Pass: ${this.credentialsModal.accessPass}\nPIN / OTP: ${this.credentialsModal.pin}`;
      this.credentialsModal.copiedAll = true;
      setTimeout(() => { if (this.credentialsModal) this.credentialsModal.copiedAll = false; }, 2500);
    }
    if (typeof navigator !== 'undefined' && navigator?.clipboard) {
      navigator.clipboard.writeText(textToCopy);
    }
  }

  proceedFromCredentialsModal() {
    const route = this.credentialsModal?.nextRoute;
    this.credentialsModal = null;
    if (route) {
      this.router.navigate([route]);
    }
  }

  showCustomAlert(message: string, title = 'Notice', type: 'success' | 'warning' | 'info' | 'error' = 'info') {
    this.customAlertModal = {
      isOpen: true,
      title,
      message,
      type
    };
  }

  closeCustomAlert() {
    this.customAlertModal = null;
  }

  // ─── USER MANAGEMENT ──────────────────────
  userSearch = '';
  userRoleFilter = 'all';
  userStatusFilter = 'all';
  editingUserId: string | null = null;
  deleteUserConfirm: any = null;

  // ─── CONTENT MANAGER STATE ──────────────────────
  contentTab: 'stories' | 'hof' | 'leaderboard' | 'talent' | 'stats' | 'news' | 'countdown' | 'slideshow' | 'philosophy' | 'events' = 'stories';
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
  hofForm: Omit<HallOfFameEntry, 'id'> & { membersInput?: string; selectedTeamId?: string } = {
    type: 'individual',
    selectedTeamId: '',
    initials: '',
    name: '',
    teamName: '',
    projectTitle: '',
    membersInput: '',
    members: [],
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

  // Sponsor settlement modal
  settleModalOpen = false;
  settleType: 'full' | 'partial' = 'full';
  settleAmount = 0;
  settleNote = '';
  settlePaymentMode: 'mobile_money' | 'bank_transfer' | 'card' = 'mobile_money';
  settleBillingSchedule: 'one_time' | 'monthly' | 'quarterly' = 'one_time';
  settlePaymentReference = '';

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
  teamForm = { id: undefined as string | undefined, name: '', track: 'Coding', lead: '', members: 4, mentor: '', motto: '', memberNames: ['', '', '', '', '', '', '', ''] };

  // Registration form
  regForm = {
    fullName: '',
    email: '',
    organization: '',
    phone: '',
    track: '',    // for judges
    tracks: [] as string[],
    tier: '',     // for sponsors (package)
    notes: ''
  };
  regSubmitting = false;
  regSuccess = false;
  regError = '';
  regPreviewTicket = '';
  emailValid: boolean | null = null;
  emailMessage = '';
  phoneValid: boolean | null = null;
  phoneMessage = '';
  adminRegLogoUrl: string | null = null;
  adminRegLogoFileId: string | null = null;

  // Registered users with generated tickets
  authSessionCount = -1;
  authSessions: any[] = [];
  authSessionsLoading = false;
  authSessionsError = '';
  tokenViewMode: 'tickets' | 'sessions' = 'tickets';
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
        file: this.formatSubmissionFiles(s.file),
        date: s.time,
        status: s.status === 'approved' ? 'Approved' : s.status === 'pending' ? 'Pending' : 'Needs Resubmission',
        feedback: s.feedback || (s.status === 'pending' ? 'Awaiting mentor evaluation' : '')
      }));
  }

  formatSubmissionFiles(file: string): string {
    if (!file) return '';
    return file.split('||').map(f => f.includes('::') ? f.split('::')[1] : f).join(', ');
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
    const activeUserEmail = getAuthValue('activeUserEmail') || '';
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
    'Networking & Cybersecurity CTF',
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
    this.regForm.track = this.regForm.tracks.join(', ');
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
  enrolledTracks: any[] = [];

  selectedCourseLeaderboardTrack = '';

  activeTracks: any[] = [];

  milestoneActivity: any[] = [];

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

  constructor(public contentService: ContentService, private route: ActivatedRoute, private router: Router, private emailService: BrevoEmailService, private fileStorage: FileStorageService, private cdr: ChangeDetectorRef, public dialogService: DialogService, public apiService: ApiService) {
    this.route.queryParams.subscribe(params => {
      if (params['tab']) {
        this.adminTab = params['tab'];
        if (this.adminTab === 'control') { this.adminSubTab = 'tickets'; }
      }
    });
  }

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
      if (req.details?.photoFileId) {
        this.loadLogo(req.details.photoFileId);
      }
    }
  }

  getLogoUrl(details: any): string {
    const fileId = details?.logoFileId || details?.photoFileId;
    if (fileId && this.logoUrls[fileId]) return this.logoUrls[fileId];
    return '';
  }

  addAuditLog(log: any): void {
    const currentAudit = [...this.contentService.auditLogs];
    currentAudit.unshift({
      time: new Date().toISOString(),
      user: 'admin@ntic.org.gh',
      type: 'system',
      ...log
    });
    if (currentAudit.length > 30) {
      currentAudit.pop();
    }
    this.contentService.saveAuditLogs(currentAudit);
  }

    // --- LIVE POSTGRESQL DATABASE MANAGER FOR ADMIN DASHBOARD ---
  activeDbTable: 'events' | 'stories' | 'schools' | 'philosophy' | 'students' | 'submissions' = 'events';
  dbData: any[] = [];
  isAddModalOpen = false;
  newRecordPayload: any = {};

  selectDbTable(table: 'events' | 'stories' | 'schools' | 'philosophy' | 'students' | 'submissions'): void {
    this.activeDbTable = table;
    this.loadDbData();
  }

  loadDbData(): void {
    if (this.activeDbTable === 'events') {
      this.apiService.getEvents().subscribe((res: any) => this.dbData = res);
    } else if (this.activeDbTable === 'stories') {
      this.apiService.getStories().subscribe((res: any) => this.dbData = res);
    } else if (this.activeDbTable === 'schools') {
      this.apiService.getSchools().subscribe((res: any) => this.dbData = res);
    } else if (this.activeDbTable === 'philosophy') {
      this.apiService.getPhilosophy().subscribe((res: any) => this.dbData = res);
    } else if (this.activeDbTable === 'students') {
      this.apiService.getStudents().subscribe((res: any) => this.dbData = res);
    } else if (this.activeDbTable === 'submissions') {
      this.apiService.getSubmissions().subscribe((res: any) => this.dbData = res);
    }
  }

  deleteDbRecord(id: string): void {
    if (!confirm('Are you sure you want to delete this row from PostgreSQL?')) return;
    if (this.activeDbTable === 'events') {
      this.apiService.deleteEvent(id).subscribe(() => this.loadDbData());
    } else if (this.activeDbTable === 'stories') {
      this.apiService.deleteStory(id).subscribe(() => this.loadDbData());
    } else if (this.activeDbTable === 'schools') {
      this.apiService.deleteSchool(id).subscribe(() => this.loadDbData());
    } else if (this.activeDbTable === 'students') {
      this.apiService.deleteStudent(id).subscribe(() => this.loadDbData());
    } else if (this.activeDbTable === 'submissions') {
      this.apiService.deleteSubmission(id).subscribe(() => this.loadDbData());
    }
  }

  openAddModal(): void {
    this.newRecordPayload = {};
    this.isAddModalOpen = true;
  }

  saveNewDbRecord(): void {
    if (this.activeDbTable === 'events') {
      this.apiService.createEvent(this.newRecordPayload).subscribe(() => {
        this.isAddModalOpen = false;
        this.loadDbData();
      });
    } else if (this.activeDbTable === 'stories') {
      this.apiService.createStory(this.newRecordPayload).subscribe(() => {
        this.isAddModalOpen = false;
        this.loadDbData();
      });
    } else if (this.activeDbTable === 'schools') {
      this.apiService.createSchool(this.newRecordPayload).subscribe(() => {
        this.isAddModalOpen = false;
        this.loadDbData();
      });
    } else if (this.activeDbTable === 'students') {
      this.apiService.createStudent(this.newRecordPayload).subscribe(() => {
        this.isAddModalOpen = false;
        this.loadDbData();
      });
    }
  }
  ngOnInit(): void {
    this.contentService.refreshBackendData();
    this.loadDbData();
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      setTimeout(() => {
        window.scrollTo(0, 0);
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
          mainContent.scrollTop = 0;
          mainContent.scrollLeft = 0;
        }
        document.querySelectorAll('.admin-tickets-table, .admin-table-sm').forEach(el => {
          el.scrollLeft = 0;
        });
      }, 0);
    }
    this.activeRoleId = getAuthValue('activeRoleId') || 'student';
    this.loadDashboardData();
    this.loadAuthSessionCount();
    this.preloadLogos();

    // Read query params to set active tab & modal state reactively
    this.route.queryParams.subscribe(params => {
      if (params['tab'] && ['overview', 'control', 'register', 'tickets', 'approvals', 'content', 'users', 'admins'].includes(params['tab'])) {
        this.adminTab = params['tab'] as any;
        if (this.adminTab === 'control' && params['subtab'] && ['tickets','approvals','content','users','admins'].includes(params['subtab'])) {
          this.adminSubTab = params['subtab'] as any;
        } else if (this.adminTab === 'control') {
          this.adminSubTab = 'tickets';
        }
        if (params['tab'] === 'approvals' || params['subtab'] === 'approvals') {
          this.loadApprovalsFromBackend();
        }
      }
      this.isRegModalOpen = params['openRegModal'] === 'true';
      if (params['action'] === 'add_team') {
        this.openAddTeamModal();
      }
    });

    if (this.activeRoleId === 'super_admin') {
      this.startLiveTelemetry();
      this.liveIntervals.push(setInterval(() => this.cdr.detectChanges(), 30000));
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
    const activeEmail = getAuthValue('activeUserEmail') || '';
    const activeUser = this.contentService.users.find(u => 
      u.email?.trim().toLowerCase() === activeEmail.toLowerCase() ||
      u.ticket?.trim().toUpperCase() === activeEmail.toUpperCase()
    );
    const userName = activeUser ? activeUser.fullName : (this.activeRoleId === 'super_admin' ? 'System Administrator' : 'Administrator');
    this.currentUser = activeUser || null;

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
        this.dashboardSubtitle = `Welcome back, ${userName}. Manage your courses and review student submissions.`;
        const instEmail = (getAuthValue('activeUserEmail') || '').trim().toLowerCase();
        const myCourseIds = this.contentService.lmsCourses
          .filter(c => c.submittedBy && c.submittedBy.toLowerCase().includes(instEmail))
          .map(c => c.id);
        const myAsgnIds = this.contentService.lmsAssignments
          .filter(a => myCourseIds.includes(a.courseId))
          .map(a => a.id);
        const mySubs = this.contentService.lmsSubmissions.filter(s => myAsgnIds.includes(s.assignmentId));
        const pendingSubs = mySubs.filter(s => s.status === 'submitted').length;
        const totalStudents = this.contentService.lmsEnrollments.filter(e => myCourseIds.includes(e.courseId)).length;
        this.stats = [
          { label: 'My Courses', value: String(myCourseIds.length), icon: 'library_books', meta: 'Owned & managed', color: 'primary' },
          { label: 'Total Students', value: String(totalStudents), icon: 'group', meta: 'Across your courses', color: 'secondary' },
          { label: 'Pending Reviews', value: String(pendingSubs), icon: 'pending_actions', meta: pendingSubs > 0 ? 'Requires attention' : 'All clear', color: 'error' },
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
        const judgeSubmissions = this.assignedSubmissions;
        const gradedCount = judgeSubmissions.filter(s => s.score !== null).length;
        const pendingCount = judgeSubmissions.filter(s => s.score === null).length;
        const totalSubmissions = judgeSubmissions.length;
        const gradedScores = judgeSubmissions.filter(s => s.score !== null).map(s => s.score);
        const avgScore = gradedScores.length > 0
          ? (gradedScores.reduce((a, b) => a + b, 0) / gradedScores.length).toFixed(1)
          : '0.0';
        const judgeTrackName = activeUser?.track || 'All tracks';

        this.stats = [
          { label: 'Assigned Submissions', value: String(totalSubmissions), icon: 'gavel', meta: `${judgeTrackName}`, color: 'primary' },
          { label: 'Graded Projects', value: String(gradedCount), icon: 'done_all', meta: totalSubmissions > 0 ? `${Math.round((gradedCount / totalSubmissions) * 100)}% complete` : '0% complete', color: 'secondary' },
          { label: 'Pending Evaluations', value: String(pendingCount), icon: 'pending', meta: pendingCount > 0 ? 'Action required' : 'All scored', color: 'error' },
          { label: 'Average Score Given', value: avgScore, icon: 'bar_chart', meta: 'Live score mean', color: 'tertiary' }
        ];
        break;

      case 'sponsor':
        this.dashboardTitle = activeUser ? `${(activeUser.organization && activeUser.organization !== '_pending_profile') ? activeUser.organization : activeUser.fullName} Sponsor Dashboard` : 'Sponsor Dashboard';
        this.dashboardSubtitle = `Welcome back, ${userName}. Corporate Sponsorship & CSR Impact Panel.`;
        const sponsorUser = activeUser;
        const sponsorTotal = sponsorUser?.total || (sponsorUser?.payments && sponsorUser.payments.length > 0 ? `GH₵ ${sponsorUser.payments.reduce((a: number, p: any) => a + (parseInt(p.amount.replace(/[^0-9]/g, ''), 10) || 0), 0).toLocaleString()}` : 'GH₵ 0');
        const paymentCount = sponsorUser?.payments?.length || 0;
        const tierName = sponsorUser?.tier || sponsorUser?.package || 'Partner';
        const trackScope = sponsorUser?.track || 'All Tracks';

        this.stats = [
          { label: 'Total Contribution', value: String(sponsorTotal), icon: 'payments', meta: `${tierName}`, color: 'primary' },
          { label: 'Payments Settled', value: String(paymentCount), icon: 'receipt_long', meta: paymentCount > 0 ? 'Verified transactions' : 'No payments yet', color: 'secondary' },
          { label: 'Supported Track', value: String(trackScope), icon: 'category', meta: 'NTI Championship', color: 'tertiary' },
          { label: 'Account Status', value: sponsorUser?.status || 'Active', icon: 'verified', meta: 'Verified Partner', color: 'error' }
        ];
        break;

      case 'super_admin':
        this.dashboardTitle = 'Command Center';
        this.dashboardSubtitle = 'National NTIC Platform · System Administration & Access Control';
        this.stats = [
          { label: 'Total Registered Users', value: String(this.contentService.userCount || this.registeredUsers.length), icon: 'manage_accounts', meta: '6 distinct portals', color: 'primary' },
          { label: 'System Health', value: '100%', icon: 'cloud_done', meta: 'All 4 nodes green', color: 'secondary' },
          { label: 'Pending Approvals', value: String(this.pendingApprovals.length), icon: 'verified_user', meta: this.pendingApprovals.length > 0 ? 'Action required' : 'All clear', color: 'error' },
          { label: 'Active Sessions', value: String(this.authSessionCount >= 0 ? this.authSessionCount : this.registeredUsers.filter(u => u.status === 'Active').length), icon: 'groups', meta: `${this.registeredUsers.filter(u => u.role === 'judge').length} Judges · ${this.registeredUsers.filter(u => u.role === 'sponsor').length} Sponsors`, color: 'tertiary' }
        ];
        break;
    }
  }

  loadAuthSessionCount(): void {
    if (this.activeRoleId !== 'super_admin') return;
    this.apiService.getAuthSessionsCount().subscribe({
      next: (res) => {
        this.authSessionCount = res.total;
        // Patch the stat card with the real count
        const tokensIdx = this.stats.findIndex(s => s.label === 'Active Sessions');
        if (tokensIdx >= 0) {
          this.stats[tokensIdx] = { ...this.stats[tokensIdx], value: String(res.total) };
        }
      },
      error: () => {} // Silently fall back to the default count from registeredUsers
    });
  }

  loadApprovalsFromBackend(): void {
    this.apiService.getApprovals().subscribe({
      next: (backendApprovals: any[]) => {
        if (!backendApprovals || backendApprovals.length === 0) return;
        const pending: any[] = [];
        const approved: any[] = [];
        const rejected: any[] = [];
        backendApprovals.forEach((a: any) => {
          const mapped = {
            id: a.id,
            type: a.type,
            entity: a.entity,
            contact: a.contact,
            submitted: a.submitted,
            details: a.details || {},
            reviewedAt: a.reviewedAt,
            reviewer: a.reviewer,
            rejectionReasons: a.rejectionReasons,
            rejectionNotes: a.rejectionNotes
          };
          if (a.status === 'pending') pending.push(mapped);
          else if (a.status === 'approved') approved.push(mapped);
          else if (a.status === 'rejected') rejected.push(mapped);
        });
        if (pending.length > 0) this.contentService.saveApprovals(pending);
        if (approved.length > 0) this.contentService.saveApprovedApprovals(approved);
        if (rejected.length > 0) this.contentService.saveRejectedApprovals(rejected);
      },
      error: () => {} // Silently fall back to localStorage
    });
  }

  loadAuthSessions(): void {
    this.authSessionsError = '';
    // Guard: no stored backend token means the request will always fail with 401.
    const storedToken = getAuthValue('activeUserToken');
    if (!storedToken) {
      this.authSessionsError = 'No active session token found. Please log out and log back in to view active sessions.';
      return;
    }
    this.authSessionsLoading = true;
    this.apiService.getAuthSessions().subscribe({
      next: (sessions) => {
        this.authSessions = sessions;
        this.authSessionsLoading = false;
      },
      error: (err) => {
        this.authSessionsLoading = false;
        if (err.status === 401 || err.status === 403) {
          this.authSessionsError = 'Session expired. Please log out and log back in to view active sessions.';
        } else if (err.status === 0 || err.status === 502 || err.status === 503) {
          this.authSessionsError = 'Cannot reach the backend server. Please make sure it is running.';
        } else {
          this.authSessionsError = 'Failed to load sessions. Please try again.';
        }
      }
    });
  }

  revokeSession(token: string): void {
    this.apiService.revokeAuthSession(token).subscribe({
      next: () => {
        this.authSessions = this.authSessions.filter(s => s.token !== token);
        this.authSessionCount = Math.max(0, this.authSessionCount - 1);
        const tokensIdx = this.stats.findIndex(s => s.label === 'Active Sessions');
        if (tokensIdx >= 0) {
          this.stats[tokensIdx] = { ...this.stats[tokensIdx], value: String(this.authSessionCount) };
        }
      },
      error: () => {}
    });
  }

  revokeAllSessions(): void {
    if (!confirm('This will revoke ALL active sessions except your current one. Proceed?')) return;
    this.apiService.revokeAllSessions().subscribe({
      next: (res) => {
        const currentToken = getAuthValue('activeUserToken');
        // Keep only the current admin's session in the local list
        this.authSessions = this.authSessions.filter(s => s.token === currentToken);
        this.authSessionCount = this.authSessions.length;
        const tokensIdx = this.stats.findIndex(s => s.label === 'Active Sessions');
        if (tokensIdx >= 0) {
          this.stats[tokensIdx] = { ...this.stats[tokensIdx], value: String(this.authSessionCount) };
        }
        alert(`Done — ${res.revoked} session(s) revoked.`);
      },
      error: (err) => {
        alert('Failed to revoke sessions: ' + (err?.error?.detail || 'Unknown error'));
      }
    });
  }

  expireUserSessions(userId: string): void {
    this.apiService.expireUserSessions(userId).subscribe({
      next: (res: any) => {
        this.authSessions = this.authSessions.filter(s => s.user_id !== userId);
        this.authSessionCount = Math.max(0, this.authSessionCount - (res?.expired || 0));
        const tokensIdx = this.stats.findIndex(s => s.label === 'Active Sessions');
        if (tokensIdx >= 0) {
          this.stats[tokensIdx] = { ...this.stats[tokensIdx], value: String(this.authSessionCount) };
        }
      },
      error: () => {}
    });
  }

  settleSponsorship(type: 'full' | 'partial'): void {
    this.settleType = type;
    this.settleAmount = 0;
    this.settleNote = '';
    this.settleModalOpen = true;
  }

  openPaymentCenter(): void {
    this.settleType = 'full';
    this.settleAmount = 0;
    this.settleNote = '';
    this.settlePaymentMode = 'mobile_money';
    this.settleBillingSchedule = 'one_time';
    this.settlePaymentReference = '';
    this.settleModalOpen = true;
  }

  closeSettleModal(): void {
    this.settleModalOpen = false;
  }

  submitSettlement(): void {
    const name = this.currentUser?.organization || this.currentUser?.fullName || 'Sponsor';
    const modeLabels: Record<string, string> = { mobile_money: 'Mobile Money', bank_transfer: 'Bank Transfer', card: 'Card' };
    const scheduleLabels: Record<string, string> = { one_time: 'One-time', monthly: 'Monthly', quarterly: 'Quarterly' };
    const audit = [...this.contentService.auditLogs];
    audit.unshift({
      action: `${this.settleType === 'full' ? 'Full' : 'Partial'} payment of GH₵${this.settleAmount.toLocaleString()} via ${modeLabels[this.settlePaymentMode]} (${scheduleLabels[this.settleBillingSchedule]}) by ${name}`,
      user: getAuthValue('activeUserEmail') || 'Sponsor',
      time: new Date().toISOString(),
      type: 'payment'
    });
    this.contentService.saveAuditLogs(audit);
    this.settleModalOpen = false;
  }

  onStatCardClick(stat: any): void {
    if (!stat || !stat.label) return;
    const label = stat.label.toLowerCase();

    if (this.activeRoleId === 'super_admin') {
      if (label.includes('registered users') || label.includes('users')) {
        this.goToTab('control'); this.goToSubTab('users');
      } else if (label.includes('pending approvals') || label.includes('approvals')) {
        this.goToTab('control'); this.goToSubTab('approvals');
      } else if (label.includes('active tokens') || label.includes('tokens') || label.includes('sessions')) {
        this.goToTab('control'); this.goToSubTab('tickets');
      } else if (label.includes('system health') || label.includes('health')) {
        this.goToTab('overview');
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
      this.apiService.updateUser(user.id, {
        email: user.email, full_name: user.fullName, role: user.role,
        ticket: user.ticket, status: users[idx].status, phone: user.phone || ''
      }).subscribe({ next: () => {}, error: () => {} });
    }
  }

  resetUserPassword(user: any): void {
    this.apiService.resetUserPassword(user.id).subscribe({
      next: (res) => {
        this.openCredentialsModal(
          'Password Reset',
          `New credentials for ${user.fullName || user.email}:`,
          res.ticket || user.ticket,
          res.otp,
          'Share these credentials securely with the user.',
          ''
        );
      },
      error: () => this.dialogService.toast('Failed to reset password.', 'error')
    });
  }

  editUserFromTable(user: any): void {
    this.router.navigate(['/user-management'], { queryParams: { edit: user.id || user.email } });
  }

  deleteUserFromTable(user: any): void {
    this.deleteUserConfirm = user;
  }

  confirmDeleteUser(): void {
    if (!this.deleteUserConfirm) return;
    this.apiService.deleteUser(this.deleteUserConfirm.id).subscribe({
      next: () => {}, error: () => {}
    });
    const users = this.contentService.users.filter(u => u.id !== this.deleteUserConfirm.id);
    this.contentService.saveUsers(users);
    this.deleteUserConfirm = null;
  }

  cancelDeleteUser(): void {
    this.deleteUserConfirm = null;
  }

  adminSponsorItems = [
    { label: 'Team Sponsorship', icon: 'groups' },
    { label: 'Student Sponsorship', icon: 'school' },
    { label: 'Track Sponsorship', icon: 'category' },
    { label: 'Mentorship Program', icon: 'psychology' },
    { label: 'Equipment & Tools', icon: 'construction' },
    { label: 'Prize & Awards', icon: 'emoji_events' }
  ];

  selectedAdminPackages: string[] = [];

  toggleAdminPackage(label: string): void {
    if (this.selectedAdminPackages.includes(label)) {
      this.selectedAdminPackages = this.selectedAdminPackages.filter(l => l !== label);
    } else {
      this.selectedAdminPackages = [...this.selectedAdminPackages, label];
    }
    this.regForm.tier = this.selectedAdminPackages.join(', ');
  }

  isAdminPackageSelected(label: string): boolean {
    return this.selectedAdminPackages.includes(label);
  }

  async generateTicket(role: 'judge' | 'sponsor'): Promise<string> {
    try {
      const res = await this.apiService.generateAccessToken(role).toPromise();
      if (res?.ticket) return res.ticket;
    } catch (_) {}
    // Fallback if backend is unreachable
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
    this.selectedAdminPackages = [];
    this.clearValidation();
    this.generatePreviewTicket();
  }

  closeRegisterModal(): void {
    this.isRegModalOpen = false;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { openRegModal: null },
      queryParamsHandling: 'merge'
    });
  }

  async onAdminRegLogoSelected(event: any): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    await this.storeAdminRegLogo(file);
    event.target.value = '';
  }

  onDropAdminRegLogo(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.resetDragStyle(event);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.storeAdminRegLogo(file);
    }
  }

  private async storeAdminRegLogo(file: File): Promise<void> {
    if (file.size > 3 * 1024 * 1024) {
      this.dialogService.toast('Logo exceeds 3MB limit.', 'warning');
      return;
    }
    if (this.adminRegLogoFileId) {
      await this.fileStorage.remove(this.adminRegLogoFileId);
      if (this.adminRegLogoUrl) this.fileStorage.revokeUrl(this.adminRegLogoUrl);
    }
    const id = this.fileStorage.generateId();
    await this.fileStorage.store(id, file);
    this.adminRegLogoFileId = id;
    this.adminRegLogoUrl = await this.fileStorage.getUrl(id);
  }

  removeAdminRegLogo(): void {
    if (this.adminRegLogoFileId) this.fileStorage.remove(this.adminRegLogoFileId);
    if (this.adminRegLogoUrl) this.fileStorage.revokeUrl(this.adminRegLogoUrl);
    this.adminRegLogoFileId = null;
    this.adminRegLogoUrl = null;
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
    // Check for duplicate email
    const existing = this.contentService.users.find(u =>
      u.email?.trim().toLowerCase() === this.regForm.email.trim().toLowerCase()
    );
    if (existing) {
      this.regError = `A user with email "${this.regForm.email}" already exists.`;
      return;
    }
    this.regError = '';
    this.regSubmitting = true;

setTimeout(async () => {
      const ticket = await this.generateTicket(this.registerRole);
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const userId = 'USR-' + Date.now().toString(36).toUpperCase();
      const newUser: any = {
        id: userId,
        role: this.registerRole,
        fullName: this.regForm.fullName,
        email: this.regForm.email,
        phone: this.regForm.phone || '',
        otp,
        password: otp,
        organization: this.regForm.organization,
        track: this.registerRole === 'judge' ? (this.regForm.tracks?.join(', ')) : undefined,
        package: this.registerRole === 'sponsor' ? this.regForm.tier : undefined,
        ticket,
        status: 'Active',
        registeredAt: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, ' '),
        lastLogin: 'Never'
      };
      if (this.adminRegLogoFileId) newUser.logoFileId = this.adminRegLogoFileId;

      // Save locally only after backend confirms
      try {
        const apiPayload: any = {
          email: newUser.email,
          full_name: newUser.fullName,
          role: newUser.role,
          ticket: newUser.ticket,
          password: newUser.password || newUser.otp || '',
          status: 'Active'
        };
        if (newUser.phone) apiPayload.phone = newUser.phone;
        await firstValueFrom(this.apiService.createUser(apiPayload));
        const currentUsers = [...this.contentService.users];
        currentUsers.unshift(newUser);
        this.contentService.saveUsers(currentUsers);
      } catch (_) {
        this.regSubmitting = false;
        this.dialogService.toast('Failed to save account to server. Please try again.', 'error');
        return;
      }

      const currentAudit = [...this.contentService.auditLogs];
      currentAudit.unshift({
        action: `${this.registerRole === 'judge' ? 'Judge' : 'Sponsor'} token ${ticket} generated for ${this.regForm.fullName}`,
        user: 'admin@ntic.org.gh',
        time: new Date().toISOString(),
        type: 'ticket'
      });
      this.contentService.saveAuditLogs(currentAudit);
      // Update stat
      this.stats = this.stats.map(s =>
        s.icon === 'groups'
          ? { ...s, value: String(this.registeredUsers.length), meta: `${this.registeredUsers.filter(u => u.role === 'judge').length} Judges · ${this.registeredUsers.filter(u => u.role === 'sponsor').length} Sponsors` }
          : s
      );

      const roleLabel = this.registerRole === 'judge' ? 'Judge' : 'Sponsor';
      this.emailService.sendApprovalEmail(
        this.regForm.email,
        this.regForm.fullName,
        this.regForm.organization || 'NTIC Competition',
        roleLabel + ' Access',
        ticket,
        otp
      );

      this.regSubmitting = false;
      this.regSuccess = true;
      this.isRegModalOpen = false;
      this.showTicketModal(newUser);

      this.regForm = { fullName: '', email: '', organization: '', phone: '', track: '', tracks: [], tier: '', notes: '' };
      this.selectedAdminPackages = [];
      this.removeAdminRegLogo();
      this.generatePreviewTicket();

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

    // Persist to backend so other machines see the approval
    this.apiService.updateApproval(req.id, {
      status: 'approved',
      reviewed_at: new Date().toLocaleString('en-GB'),
      reviewer: 'admin@ntic.org.gh'
    }).subscribe({ next: () => {}, error: () => {} });

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
        region: req.details?.region || '',
        ticket,
        applicationCode: req.details?.code || '',
        status: 'Active',
        registeredAt: new Date().toLocaleDateString('en-GB'),
        lastLogin: 'Never'
      };

      this.apiService.createUser({
        email: newSchoolAdmin.email, full_name: newSchoolAdmin.fullName, role: 'school_admin',
        ticket, password: otp, status: 'Active', phone: newSchoolAdmin.phone
      }).subscribe({ next: () => {}, error: () => {} });

      const stats = { ...this.contentService.platformStats };
      stats.schools += 1;
      this.contentService.updatePlatformStats(stats);

      if (req.details?.teamsList && Array.isArray(req.details.teamsList)) {
        const currentTeams = [...this.contentService.teams];
        req.details.teamsList.forEach((t: any) => {
          const roster = [t.leadName, t.member2Name, t.member3Name, t.member4Name, t.member5Name].filter(Boolean).map((n: string) => n.trim()).filter((n: string) => n.length > 0);
          const newTeam: any = {
            name: t.name,
            track: t.track || 'Coding',
            lead: t.leadName || (roster[0] || 'Student Captain'),
            members: Math.max(roster.length, 3),
            rosterList: roster,
            status: 'In Competition',
            mentor: 'Assigned Coordinator',
            motto: 'National NTI Competition Squad',
            schoolName: req.entity
          };
          currentTeams.push(newTeam);
          this.contentService.syncNewTeamToBackend(newTeam);
        });
        this.contentService.saveTeams(currentTeams);
      }

      if (req.details?.students && Array.isArray(req.details.students)) {
        req.details.students.forEach((s: any) => {
          const existingEmail = s.email || `${s.name?.toLowerCase().replace(/\s+/g, '.')}@student.ntic.edu.gh`;
          const sTicket = `NTIC-STU-${Math.floor(1000 + Math.random() * 9000)}`;
          const sOtp = Math.floor(100000 + Math.random() * 900000).toString();
          this.apiService.createUser({
            email: existingEmail, full_name: s.name, role: 'student',
            ticket: sTicket, password: sOtp, status: 'Active', phone: ''
          }).subscribe({ next: () => {}, error: () => {} });
        });
      }

      this.emailService.sendApprovalEmail(req.contact, req.entity + ' Admin', req.entity, req.type, ticket, otp);
      this.openCredentialsModal('School Registration Approved!', `School Admin account generated for ${req.entity}. Official credentials ready below:`, ticket, otp, `Access credentials sent to ${req.contact}`);
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
      this.contentService.syncNewTeamToBackend(newTeam);

      const stats = { ...this.contentService.platformStats };
      stats.projects += 0.1;
      this.contentService.updatePlatformStats(stats);

      const leadEmail = req.details?.leadEmail || req.contact;
      if (leadEmail) {
        const ticket = 'NTIC-GRP-' + Math.floor(1000 + Math.random() * 9000);
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const leadName = req.details?.members?.[0] || 'Team Lead';
        const newLeadUser = {
          id: 'USR-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          role: 'student' as const,
          registrationMode: 'group' as const,
          fullName: `${leadName} (${req.entity})`,
          email: leadEmail,
          phone: '',
          otp,
          password: otp,
          organization: req.entity,
          track: req.details?.track || 'Coding',
          ticket,
          applicationCode: req.details?.code || '',
          status: 'Active',
          registeredAt: new Date().toLocaleDateString('en-GB'),
          lastLogin: 'Never'
        };
        if (req.details?.memberPhotos?.length) (newLeadUser as any).photoFileId = req.details.memberPhotos[0];
        this.apiService.createUser({
          email: newLeadUser.email, full_name: newLeadUser.fullName, role: newLeadUser.role,
          ticket: newLeadUser.ticket, password: newLeadUser.password || otp, status: 'Active', phone: ''
        }).subscribe({ next: () => {}, error: () => {} });

        this.emailService.sendApprovalEmail(leadEmail, leadName, req.entity, req.type, ticket, otp);
        this.openCredentialsModal('Team Addition Approved!', `Your squad "${req.entity}" has been approved. Team Lead credentials ready below:`, ticket, otp, `Access pass & security PIN sent to ${leadEmail}`);
      } else {
        this.emailService.sendApprovalEmail(req.contact, req.entity, req.entity, req.type, 'N/A — Team Added', 'N/A');
        this.showCustomAlert(`Team "${req.entity}" has been successfully approved and added to national competition tracks.`, 'Team Addition Approved', 'success');
      }
    } else if (req.type === 'Student Registration') {
      const ticket = 'NTIC-STU-' + Math.floor(1000 + Math.random() * 9000);
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const newStudent = {
        id: 'USR-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        role: 'student' as const,
        fullName: req.entity,
        email: req.contact,
        phone: '',
        guardianName: req.details?.guardianName || '',
        guardianPhone: req.details?.guardianPhone || '',
        photoFileId: req.details?.photoFileId || undefined,
        otp,
        password: otp,
        organization: req.details?.school || 'Independent Competitor',
        region: req.details?.region || '',
        track: req.details?.track || 'Coding',
        skills: req.details?.skills || { alg: 'intermediate', hw: 'novice', ai: 'novice' },
        ticket,
        applicationCode: req.details?.code || '',
        status: 'Active',
        registeredAt: new Date().toLocaleDateString('en-GB'),
        lastLogin: 'Never'
      };
      this.apiService.createUser({
        email: newStudent.email, full_name: newStudent.fullName, role: 'student',
        ticket, password: otp, status: 'Active', phone: ''
      }).subscribe({ next: () => {}, error: () => {} });

      const stats = { ...this.contentService.platformStats };
      stats.students += 1;
      this.contentService.updatePlatformStats(stats);

      this.emailService.sendApprovalEmail(req.contact, req.entity, req.entity, req.type, ticket, otp);
      this.openCredentialsModal('Student Registration Approved!', `Competitor account generated for ${req.entity}. Official credentials ready below:`, ticket, otp, `Access pass & security PIN sent to ${req.contact}`);
    } else if (req.type === 'Instructor Access') {
      const ticket = 'NTIC-INS-' + Math.random().toString(36).substring(2, 6).toUpperCase();
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      this.apiService.createUser({
        email: req.contact, full_name: req.entity, role: 'instructor',
        ticket, password: otp, status: 'Active', phone: req.details?.phone || ''
      }).subscribe({ next: () => {}, error: () => {} });

      const stats = { ...this.contentService.platformStats };
      stats.mentors += 1;
      this.contentService.updatePlatformStats(stats);

      this.emailService.sendApprovalEmail(req.contact, req.entity, req.entity, req.type, ticket, otp);
      this.openCredentialsModal('Instructor Access Approved!', `Certified Instructor account generated for ${req.entity}. Official credentials ready below:`, ticket, otp, `Access pass & security PIN sent to ${req.contact}`);
    }

    const currentAudit = [...this.contentService.auditLogs];
    currentAudit.unshift({
      action: `${req.type} approved: ${req.entity}`,
      user: 'admin@ntic.org.gh',
      time: new Date().toISOString(),
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
    } else if (type === 'Student Registration') {
      return [
        'Student eligibility details incomplete',
        'Guardian consent not verified',
        'Contact email or phone invalid',
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

  getReasonIcon(reason: string): string {
    if (reason.includes('document')) return 'description';
    if (reason.includes('email') || reason.includes('phone') || reason.includes('contact')) return 'contact_mail';
    if (reason.includes('lab') || reason.includes('verif')) return 'verified';
    if (reason.includes('duplicate')) return 'content_copy';
    if (reason.includes('capacity')) return 'group_off';
    if (reason.includes('vague') || reason.includes('proposal')) return 'lightbulb';
    if (reason.includes('eligibility')) return 'person_off';
    if (reason.includes('guardian') || reason.includes('consent')) return 'family_restroom';
    if (reason.includes('background') || reason.includes('check')) return 'security';
    if (reason.includes('mismatch')) return 'swap_horiz';
    if (reason.includes('credential') || reason.includes('certif')) return 'card_membership';
    if (reason.includes('registry')) return 'database';
    if (reason.includes('student team')) return 'groups';
    return 'error';
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

    // Persist to backend so other machines see the rejection
    this.apiService.updateApproval(this.activeReviewRequest.id, {
      status: 'rejected',
      reviewed_at: new Date().toLocaleString('en-GB'),
      reviewer: 'admin@ntic.org.gh',
      rejection_reasons: reasons || 'No specific reason provided',
      rejection_notes: this.rejectionNotes || ''
    }).subscribe({ next: () => {}, error: () => {} });

    this.emailService.sendRejectionEmail(
      this.activeReviewRequest.contact,
      this.activeReviewRequest.entity,
      this.activeReviewRequest.entity,
      this.activeReviewRequest.type,
      reasons || 'No specific reason provided',
      this.rejectionNotes || ''
    );
    
    const currentAudit = [...this.contentService.auditLogs];
    currentAudit.unshift({
      action: `${this.activeReviewRequest.type} rejected: ${this.activeReviewRequest.entity} (${logDetails})`,
      user: 'admin@ntic.org.gh',
      time: new Date().toISOString(),
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

  quickRejectFromPreview(): void {
    const req = this.activePreviewRequest;
    if (!req) return;

    const defaultReasons = {
      'School Registration': 'Application did not meet accreditation requirements',
      'Team Addition': 'Team registration did not meet competition criteria',
      'Student Registration': 'Student registration did not meet eligibility requirements',
      'Instructor Access': 'Instructor credentials could not be verified'
    } as Record<string, string>;
    const reason = defaultReasons[req.type] || 'Application did not meet requirements';

    const rejected = {
      ...req,
      reviewedAt: new Date().toLocaleString('en-GB'),
      reviewer: 'admin@ntic.org.gh',
      rejectionReasons: reason,
      rejectionNotes: 'Rejected during preview review.'
    };

    const currentRejected = [...this.contentService.rejectedApprovals];
    currentRejected.unshift(rejected);
    this.contentService.saveRejectedApprovals(currentRejected);

    this.pendingApprovals = this.pendingApprovals.filter(r => r.id !== req.id);

    this.emailService.sendRejectionEmail(
      req.contact, req.entity, req.entity, req.type,
      reason, 'Rejected during preview review.'
    );

    const currentAudit = [...this.contentService.auditLogs];
    currentAudit.unshift({
      action: `${req.type} rejected (quick): ${req.entity} — ${reason}`,
      user: 'admin@ntic.org.gh',
      time: new Date().toISOString(),
      type: 'system'
    });
    this.contentService.saveAuditLogs(currentAudit);

    this.stats = this.stats.map(s =>
      s.icon === 'verified_user'
        ? { ...s, value: String(this.pendingApprovals.length), meta: this.pendingApprovals.length > 0 ? 'Action required' : 'All clear' }
        : s
    );

    this.closePreview();
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
      this.apiService.updateUser(this.editingAdmin.id, {
        email: this.adminForm.email,
        full_name: this.adminForm.fullName,
        role: this.adminForm.role,
        ticket: this.adminForm.ticket,
        status: this.adminForm.status,
        phone: this.adminForm.phone || ''
      }).subscribe({
        next: () => {},
        error: () => {}
      });
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

      this.apiService.createUser({
        email: newUser.email,
        full_name: newUser.fullName,
        role: newUser.role,
        ticket: newUser.ticket,
        password: newUser.password || otp,
        status: 'Active',
        phone: newUser.phone
      }).subscribe({
        next: () => {
          const currentUsers = [...this.contentService.users];
          currentUsers.unshift(newUser);
          this.contentService.saveUsers(currentUsers);
          this.addAuditLog({ action: `Created ${this.adminForm.role} account: ${this.adminForm.fullName} (${this.adminForm.email})`, type: 'approval' });
          this.closeAdminModal();
          this.showTicketModal(newUser);
        },
        error: () => {
          this.dialogService.toast('Failed to save account to server. Please try again.', 'error');
        }
      });
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
    this.apiService.deleteUser(this.deleteConfirmAdmin.id).subscribe({
      next: () => {},
      error: () => {}
    });
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

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    el.style.borderColor = 'var(--primary)';
    el.style.background = 'rgba(0, 63, 135, 0.08)';
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    el.style.borderColor = '';
    el.style.background = '';
  }

  onDropStoryImage(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.resetDragStyle(event);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.storyForm.image = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  onDropSlideImage(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.resetDragStyle(event);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.slideForm.image = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  onDropSlideVideo(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.resetDragStyle(event);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.handleVideoFile(file);
    }
  }

  onDropPhilCardImage(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.resetDragStyle(event);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.handlePhilCardImage(file);
    }
  }

  private resetDragStyle(event: DragEvent): void {
    const el = event.currentTarget as HTMLElement;
    el.style.borderColor = '';
    el.style.background = '';
  }

  private async handleVideoFile(file: File): Promise<void> {
    const id = `slide-video-${Date.now()}`;
    await this.fileStorage.store(id, file);
    this.slideForm.videoFileId = id;
    this.slideForm.videoThumbnail = await this.captureVideoThumbnail(file);
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
    
    const payload = {
      title: this.storyForm.title,
      excerpt: this.storyForm.body,
      date: this.storyForm.date || '',
      image: this.storyForm.image
    };

    if (this.editingStoryId) {
      this.contentService.updateStory({ id: this.editingStoryId, ...this.storyForm });
      this.apiService.updateStory(this.editingStoryId, payload).subscribe({ next: () => {}, error: () => {} });
      this.addAuditLog({ action: `Championship Story updated: "${this.storyForm.title.slice(0, 40)}..."`, user: 'admin@ntic.org.gh', time: new Date().toISOString(), type: 'system' });
    } else {
      this.contentService.addStory({ ...this.storyForm });
      this.apiService.createStory(payload).subscribe({ next: () => {}, error: () => {} });
      this.addAuditLog({ action: `Championship Story added: "${this.storyForm.title.slice(0, 40)}..."`, user: 'admin@ntic.org.gh', time: new Date().toISOString(), type: 'system' });
    }
    this.storyFormOpen = false;
  }

  removeStory(id: string): void {
    this.contentService.removeStory(id);
    this.apiService.deleteStory(id).subscribe({ next: () => {}, error: () => {} });
    this.addAuditLog({ action: `Championship Story removed (ID: ${id})`, user: 'admin@ntic.org.gh', time: new Date().toISOString(), type: 'system' });
  }

  // ── Slideshow Management ──────────────────────────────
  slideFormOpen = false;
  editingSlideId: string | null = null;
  slideForm: any = { title: '', image: '', videoFileId: '', videoUrl: '' };
  slideSavedFields: Record<string, boolean> = {};
  isVideoMuted = true;

  toggleVideoMute(): void {
    this.isVideoMuted = !this.isVideoMuted;
  }

  addSlide(): void {
    this.editingSlideId = null;
    this.slideForm = {
      title: '', image: '', videoFileId: '', videoUrl: '',
      tag: 'National Championship',
      description: 'Bringing together high school teams from all 16 regions to solve real-world problems through Coding, Robotics, AI, Networking & Cybersecurity, and Open Innovation.',
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
    this.expandedSection = true;
  }

  exitMaximize(): void {
    this.maximizedContentTab = null;
    this.expandedSection = false;
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
      ...this.slideForm, tag: this.slideForm.tag || 'National Championship',
      description: this.slideForm.description || '',
      ctaText: this.slideForm.ctaText || 'Enter Portal', ctaLink: this.slideForm.ctaLink || '#portal'
    };
    const slideId = this.editingSlideId || `slide-${Date.now()}`;
    if (this.editingSlideId) {
      const idx = slides.findIndex(s => s.id === this.editingSlideId);
      if (idx > -1) slides[idx] = { ...slides[idx], ...saved, id: slideId };
      this.apiService.deleteHeroSlide(this.editingSlideId).subscribe({
        next: () => this.apiService.createHeroSlide({ id: slideId, title: saved.title, tag: saved.tag, description: saved.description, image: saved.image || '', videoFileId: saved.videoFileId || '', videoUrl: saved.videoUrl || '' }).subscribe({ next: () => {}, error: () => {} }),
        error: () => {}
      });
      this.addAuditLog({ action: `Slide updated: "${(this.slideForm.title || 'Untitled').slice(0, 40)}"`, user: 'admin@ntic.org.gh', time: new Date().toISOString(), type: 'system' });
    } else {
      slides.push({ id: slideId, ...saved });
      this.apiService.createHeroSlide({ id: slideId, title: saved.title, tag: saved.tag, description: saved.description, image: saved.image || '', videoFileId: saved.videoFileId || '', videoUrl: saved.videoUrl || '' }).subscribe({ next: () => {}, error: () => {} });
      this.addAuditLog({ action: `Slide added: "${(this.slideForm.title || 'Untitled').slice(0, 40)}"`, user: 'admin@ntic.org.gh', time: new Date().toISOString(), type: 'system' });
    }
    this.contentService.saveHeroSlides(slides); this.slideFormOpen = false;
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
    this.addAuditLog({ action: `Slide field saved: ${fieldNames[field] || field}`, user: 'admin@ntic.org.gh', time: new Date().toISOString(), type: 'system' });
  }

  deleteSlide(slide: any): void {
    const slides = this.contentService.heroSlides.filter(s => s.id !== slide.id);
    this.contentService.saveHeroSlides(slides);
    this.apiService.deleteHeroSlide(slide.id).subscribe({ next: () => {}, error: () => {} });
    this.addAuditLog({ action: `Slide deleted: "${slide.title}"`, user: 'admin@ntic.org.gh', time: new Date().toISOString(), type: 'system' });
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

  // ── Philosophy Cards (Learn. Innovate. Build.) ──────
  philCardFormOpen = false;
  editingPhilCard: any = {};

  openPhilCardForm(card: any): void {
    if (card) {
      this.editingPhilCard = { ...card };
    } else {
      this.editingPhilCard = { id: 'phil-' + Date.now(), title: '', description: '', image: '' };
    }
    this.philCardFormOpen = true;
  }

  savePhilCard(): void {
    this.contentService.savePhilosophyCard(this.editingPhilCard);
    const isNew = !this.editingPhilCard.id || this.editingPhilCard.id.length < 12;
    const payload = { title: this.editingPhilCard.title, description: this.editingPhilCard.description || '', image: this.editingPhilCard.image || '' };
    if (isNew) {
      this.apiService.createPhilosophy(payload).subscribe({ next: () => {}, error: () => {} });
    } else {
      this.apiService.updatePhilosophy(this.editingPhilCard.id, payload).subscribe({ next: () => {}, error: () => {} });
    }
    this.philCardFormOpen = false;
    this.addAuditLog({ action: `Philosophy card saved: "${this.editingPhilCard.title}"`, user: 'admin@ntic.org.gh', time: new Date().toISOString(), type: 'system' });
  }

  deletePhilCard(card: any): void {
    const list = this.contentService.philosophyCards.filter(c => c.id !== card.id);
    this.contentService.savePhilosophyCards(list);
    this.apiService.deletePhilosophy(card.id).subscribe({ next: () => {}, error: () => {} });
    this.addAuditLog({ action: `Philosophy card deleted: "${card.title}"`, user: 'admin@ntic.org.gh', time: new Date().toISOString(), type: 'system' });
  }

  movePhilCard(index: number, direction: -1 | 1): void {
    const list = [...this.contentService.philosophyCards];
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    this.contentService.savePhilosophyCards(list);
  }

  onPhilCardImageUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.handlePhilCardImage(input.files[0]);
  }

  private handlePhilCardImage(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      this.editingPhilCard.image = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  // ── Upcoming Events ──────────────────────────────────
  eventFormOpen = false;
  editingEvent: UpcomingEvent = { id: '', month: '', day: '', title: '', description: '', location: '' };
  eventDate = '';

  openEventForm(event: UpcomingEvent | null): void {
    if (event) {
      this.editingEvent = { ...event };
      this.eventDate = this.eventDateFromMonthDay(event.month, event.day);
    } else {
      this.editingEvent = { id: 'evt-new-' + Date.now(), month: '', day: '', title: '', description: '', location: '' };
      this.eventDate = '';
    }
    this.eventFormOpen = true;
  }

  onEventDateChange(): void {
    if (!this.eventDate) { this.editingEvent.month = ''; this.editingEvent.day = ''; return; }
    const d = new Date(this.eventDate + 'T12:00:00');
    if (isNaN(d.getTime())) return;
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    this.editingEvent.month = months[d.getMonth()];
    this.editingEvent.day = String(d.getDate());
  }

  onEventDateInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    if (target) {
      this.eventDate = target.value;
      this.onEventDateChange();
    }
  }

  private eventDateFromMonthDay(month: string, day: string): string {
    const months: Record<string, number> = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
    const m = months[month?.toLowerCase().slice(0, 3)];
    if (m === undefined || !day) return '';
    const y = new Date().getFullYear();
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
  }

  saveEvent(): void {
    const e = this.editingEvent;
    if (!e.title) return;
    const isNew = e.id.startsWith('evt-new-');
    if (isNew) {
      this.contentService.addEvent({ month: e.month, day: e.day, title: e.title, description: e.description, location: e.location });
    } else {
      this.contentService.updateEvent(e);
    }
    // Persist to backend
    const dateStr = e.month && e.day ? `2026-${this.monthToNumber(e.month)}-${String(e.day).padStart(2, '0')}` : '';
    const payload = {
      title: e.title,
      date: dateStr,
      time: '',
      location: e.location || '',
      description: e.description || ''
    };
    if (isNew) {
      this.apiService.createEvent(payload).subscribe({ next: () => {}, error: () => {} });
    } else {
      this.apiService.updateEvent(e.id, payload).subscribe({ next: () => {}, error: () => {} });
    }
    this.eventFormOpen = false;
    this.addAuditLog({ action: `Event saved: "${e.title}"`, user: 'admin@ntic.org.gh', time: new Date().toISOString(), type: 'system' });
  }

  private monthToNumber(m: string): string {
    const months: Record<string, string> = { 'Jan':'01','Feb':'02','Mar':'03','Apr':'04','May':'05','Jun':'06','Jul':'07','Aug':'08','Sep':'09','Oct':'10','Nov':'11','Dec':'12' };
    return months[m] || '01';
  }

  deleteEvent(event: UpcomingEvent): void {
    this.contentService.removeEvent(event.id);
    this.apiService.deleteEvent(event.id).subscribe({ next: () => {}, error: () => {} });
    this.addAuditLog({ action: `Event deleted: "${event.title}"`, user: 'admin@ntic.org.gh', time: new Date().toISOString(), type: 'system' });
  }

  // Hall of Fame
  openHofForm(): void {
    this.editingHofId = null;
    const defaultExpiry = new Date();
    defaultExpiry.setFullYear(defaultExpiry.getFullYear() + 1);
    const expiryStr = defaultExpiry.toISOString().split('T')[0];
    
    this.hofForm = {
      type: 'individual',
      initials: '',
      name: '',
      teamName: '',
      projectTitle: '',
      membersInput: '',
      members: [],
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
      type: entry.type || 'individual',
      initials: entry.initials || '',
      name: entry.name || '',
      teamName: entry.teamName || '',
      projectTitle: entry.projectTitle || '',
      membersInput: entry.members ? entry.members.join(', ') : '',
      members: entry.members ? [...entry.members] : [],
      school: entry.school || '',
      year: entry.year || '',
      badge: entry.badge || '',
      trackClass: entry.trackClass || 'coding-track',
      expiryDate: entry.expiryDate || ''
    };
    this.hofFormError = '';
    this.hofFormOpen = true;
  }
  onHofTypeChange(newType: string): void {
    // Reset autofilled fields when switching types so group data doesn't bleed into individual
    this.hofForm.name = '';
    this.hofForm.teamName = '';
    this.hofForm.school = '';
    this.hofForm.members = [];
    this.hofForm.membersInput = '';
    this.hofForm.selectedTeamId = '';
    this.hofForm.badge = '';
    this.hofForm.initials = '';
  }

  onHofTeamSelect(teamId: string): void {
    if (!teamId) return;
    const team = this.contentService.teams.find(t => t.id === teamId || t.name === teamId);
    if (!team) return;

    this.hofForm.name = team.name;
    this.hofForm.teamName = team.name;
    this.hofForm.school = team.schoolName || '';
    
    // Extract member names safely
    let memberList: string[] = [];
    const tAny = team as any;
    if (Array.isArray(tAny.memberNames) && tAny.memberNames.length > 0) {
      memberList = [...tAny.memberNames];
    } else if (Array.isArray(tAny.rosterList) && tAny.rosterList.length > 0) {
      memberList = [...tAny.rosterList];
    } else if (Array.isArray(tAny.members)) {
      memberList = tAny.members.map((m: any) => String(m));
    } else if (typeof tAny.members === 'string' && tAny.members) {
      memberList = tAny.members.split(',').map((m: string) => m.trim()).filter((m: string) => m.length > 0);
    }
    
    if (team.lead && !memberList.includes(team.lead)) {
      memberList.unshift(team.lead);
    }

    this.hofForm.members = memberList;
    this.hofForm.membersInput = memberList.join(', ');

    // Match trackClass from team.track
    const track = (team.track || '').toLowerCase();
    if (track.includes('robot')) this.hofForm.trackClass = 'robotics-track';
    else if (track.includes('ai') || track.includes('artificial')) this.hofForm.trackClass = 'ai-track';
    else if (track.includes('cyber') || track.includes('security')) this.hofForm.trackClass = 'cyber-track';
    else if (track.includes('innovat')) this.hofForm.trackClass = 'innovation-track';
    else this.hofForm.trackClass = 'coding-track';

    if (!this.hofForm.badge) {
      this.hofForm.badge = `🏆 ${team.track || 'Championship'} Squad Winners`;
    }

    this.hofForm.initials = this.getInitials(team.name);
  }

  isEntryExpired(entry: any): boolean {
    if (!entry.expiryDate) return false;
    const today = new Date().toISOString().split('T')[0];
    return entry.expiryDate < today;
  }

  closeHofForm(): void { this.hofFormOpen = false; }
  
  submitHofForm(): void {
    if (!this.hofForm.name || !this.hofForm.school || !this.hofForm.badge) {
      this.hofFormError = 'Name/Squad Name, school, and badge/title are required.';
      return;
    }

    if (this.hofForm.type === 'group' && this.hofForm.membersInput) {
      this.hofForm.members = this.hofForm.membersInput
        .split(',')
        .map(m => m.trim())
        .filter(m => m.length > 0);
    } else if (this.hofForm.type === 'individual') {
      this.hofForm.members = [];
    }

    if (!this.hofForm.initials) {
      this.hofForm.initials = this.getInitials(this.hofForm.name);
    }
    
    const payload = {
      type: this.hofForm.type,
      initials: this.hofForm.initials,
      name: this.hofForm.name,
      teamName: this.hofForm.teamName || this.hofForm.name,
      projectTitle: this.hofForm.projectTitle || '',
      members: this.hofForm.members || [],
      school: this.hofForm.school,
      year: this.hofForm.year,
      badge: this.hofForm.badge,
      trackClass: this.hofForm.trackClass,
      expiryDate: this.hofForm.expiryDate || ''
    };

    if (this.editingHofId) {
      this.contentService.updateHofEntry({ id: this.editingHofId, ...payload });
      this.addAuditLog({ action: `Hall of Fame entry updated: ${this.hofForm.name}`, user: 'admin@ntic.org.gh', time: new Date().toISOString(), type: 'system' });
    } else {
      this.contentService.addHofEntry({ ...payload });
      this.addAuditLog({ action: `Hall of Fame entry added: ${this.hofForm.name}`, user: 'admin@ntic.org.gh', time: new Date().toISOString(), type: 'system' });
    }
    this.hofFormOpen = false;
  }
  
  removeHofEntry(id: string): void {
    this.contentService.removeHofEntry(id);
    this.addAuditLog({ action: `Hall of Fame entry removed (ID: ${id})`, user: 'admin@ntic.org.gh', time: new Date().toISOString(), type: 'system' });
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
      this.apiService.updateSchool(this.lbEditId, {
        name: this.lbForm.schoolName,
        region: this.lbForm.region,
        teams: 1,
        score: this.lbForm.points,
        rank: parseInt(this.lbForm.rank, 10) || 0,
        status: 'active'
      }).subscribe({ next: () => {}, error: () => {} });
      this.addAuditLog({ action: `Leaderboard updated: ${this.lbForm.schoolName}`, user: 'admin@ntic.org.gh', time: new Date().toISOString(), type: 'system' });
    } else {
      this.contentService.addLeaderboardEntry({ ...this.lbForm });
      this.apiService.createSchool({
        name: this.lbForm.schoolName,
        region: this.lbForm.region,
        teams: 1,
        score: this.lbForm.points,
        rank: parseInt(this.lbForm.rank, 10) || 0,
        status: 'active'
      }).subscribe({ next: () => {}, error: () => {} });
      this.addAuditLog({ action: `Leaderboard entry added: ${this.lbForm.schoolName}`, user: 'admin@ntic.org.gh', time: new Date().toISOString(), type: 'system' });
    }
    this.lbFormOpen = false;
    this.lbEditId = null;
  }
  removeLbEntry(id: string): void {
    this.contentService.removeLeaderboardEntry(id);
    this.apiService.deleteSchool(id).subscribe({ next: () => {}, error: () => {} });
    this.addAuditLog({ action: `Leaderboard entry removed (ID: ${id})`, user: 'admin@ntic.org.gh', time: new Date().toISOString(), type: 'system' });
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
      this.apiService.updateTalent(this.tdEditId, {
        student_name: this.tdForm.studentName,
        school: this.tdForm.schoolAndGrade,
        track: this.tdForm.category,
        project_title: `${this.tdForm.studentName} - ${this.tdForm.category}`,
        talent_tags: this.tdForm.category,
        description: `${this.tdForm.studentName} scoring ${this.tdForm.score} in ${this.tdForm.category}`,
        mentor: '',
        status: 'active'
      }).subscribe({ next: () => {}, error: () => {} });
      this.addAuditLog({ action: `Talent Discovery entry updated for ${this.tdForm.studentName}`, user: 'admin@ntic.org.gh', time: new Date().toISOString(), type: 'system' });
    } else {
      const newId = 'td-' + Date.now();
      this.contentService.addTalentDiscovery({ ...this.tdForm });
      this.apiService.createTalent({
        student_name: this.tdForm.studentName,
        school: this.tdForm.schoolAndGrade,
        track: this.tdForm.category,
        project_title: `${this.tdForm.studentName} - ${this.tdForm.category}`,
        talent_tags: this.tdForm.category,
        description: `${this.tdForm.studentName} scoring ${this.tdForm.score} in ${this.tdForm.category}`,
        mentor: '',
        status: 'active'
      }).subscribe({ next: () => {}, error: () => {} });
      this.addAuditLog({ action: `Talent Discovery entry added for ${this.tdForm.studentName}`, user: 'admin@ntic.org.gh', time: new Date().toISOString(), type: 'system' });
    }
    this.tdFormOpen = false;
    this.tdEditId = null;
  }

  removeTdEntry(id: string): void {
    this.contentService.removeTalentDiscovery(id);
    this.apiService.deleteTalent(id).subscribe({ next: () => {}, error: () => {} });
    this.addAuditLog({ action: `Talent Discovery entry removed (ID: ${id})`, user: 'admin@ntic.org.gh', time: new Date().toISOString(), type: 'system' });
  }

  // Platform Stats
  openStatsEdit(): void {
    this.statsForm = { ...this.contentService.platformStats };
    this.statsEditMode = true;
  }
  saveStats(): void {
    this.contentService.updatePlatformStats({ ...this.statsForm });
    this.apiService.updatePlatformStats({
      regions: this.statsForm.regions,
      mentors: this.statsForm.mentors,
      schools: this.statsForm.schools,
      students: this.statsForm.students,
      projects: this.statsForm.projects,
      grants: this.statsForm.grants
    }).subscribe({ next: () => {}, error: () => {} });
    this.statsEditMode = false;
    this.addAuditLog({ action: 'Platform impact stats updated', user: 'admin@ntic.org.gh', time: new Date().toISOString(), type: 'system' });
  }

  async clearAllData(): Promise<void> {
    const ok = await this.dialogService.confirm({
      title: 'Wipe & Reset Platform Data',
      message: 'Are you sure you want to clear all data and start with a clean slate? This will reset all portals.',
      confirmText: 'Clear All Data',
      type: 'danger'
    });
    if (ok) {
      this.contentService.clearAllData();
      this.dialogService.toast('All data wiped! You are now in a clean testing state.', 'warning');
      this.loadDashboardData();
    }
  }

  async loadSampleData(): Promise<void> {
    const ok = await this.dialogService.confirm({
      title: 'Restore Sample Data',
      message: 'Are you sure you want to restore the original sample data? This will overwrite your current test inputs.',
      confirmText: 'Restore Data',
      type: 'warning'
    });
    if (ok) {
      this.contentService.loadSampleData();
      this.dialogService.toast('Sample data restored successfully!', 'success');
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
    this.apiService.updatePlatformStats({ countdown_date: dateStr }).subscribe({
      next: () => {
        this.dialogService.toast('Target countdown date updated successfully!', 'success');
      },
      error: (err) => {
        console.error('Failed to update countdown date on server:', err);
        this.dialogService.toast('Saved locally, but failed to sync with server.', 'warning');
      }
    });
    this.addAuditLog({ action: `Countdown target date updated to ${dateStr}`, user: 'admin@ntic.org.gh', time: new Date().toISOString(), type: 'system' });
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
      this.addAuditLog({ action: `News item updated: "${this.newsForm.headline.slice(0, 40)}"`, user: 'admin@ntic.org.gh', time: new Date().toISOString(), type: 'system' });
    } else {
      this.contentService.addNewsItem({ ...this.newsForm });
      this.addAuditLog({ action: `News item published: "${this.newsForm.headline.slice(0, 40)}"`, user: 'admin@ntic.org.gh', time: new Date().toISOString(), type: 'system' });
    }
    this.newsFormOpen = false;
  }

  removeNewsItem(id: string): void {
    this.contentService.removeNewsItem(id);
    this.addAuditLog({ action: `News item removed (ID: ${id})`, user: 'admin@ntic.org.gh', time: new Date().toISOString(), type: 'system' });
  }

  trackClass_options = [
    { value: 'coding-track', label: '⚡ Coding' },
    { value: 'robotics-track', label: '🤖 Robotics' },
    { value: 'ai-track', label: '🧠 AI & ML' },
    { value: 'cyber-track', label: 'Networking & Cybersecurity' },
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
                motto: 'National NTI Competition Squad',
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
    this.teamForm = { id: undefined, name: '', track: 'Coding', lead: '', members: 4, mentor: '', motto: '', memberNames: ['', '', '', '', '', '', '', ''] };
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
      id: team.id,
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


  async disbandTeam(team: any): Promise<void> {
    const ok = await this.dialogService.confirm({
      title: 'Disband Squad',
      message: `Are you sure you want to disband squad "${team.name}" and remove all registered student members from the tournament?`,
      confirmText: 'Disband Squad',
      type: 'danger'
    });
    if (ok) {
      const deleteSuccess = () => {
        const currentTeams = this.contentService.teams.filter(t => t !== team && t.name !== team.name && t.id !== team.id);
        this.contentService.saveTeams(currentTeams);
        this.addAuditLog({
          action: `School Admin (${this.schoolName}) disbanded squad: ${team.name}`,
          user: getAuthValue('activeUserEmail') || 'School Admin',
          time: new Date().toISOString(),
          type: 'approval'
        });
        this.dialogService.toast(`Squad "${team.name}" has been disbanded.`, 'info');
      };

      if (team.id && !team.id.startsWith('temp-')) {
        this.apiService.deleteTeam(team.id).subscribe({
          next: deleteSuccess,
          error: (err) => {
            console.error('Failed to delete team in backend:', err);
            this.dialogService.toast('Failed to disband squad in database.', 'error');
          }
        });
      } else {
        deleteSuccess();
      }
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

    const teamPayload = {
      name: this.teamForm.name.trim(),
      track: this.teamForm.track,
      lead: this.teamForm.lead.trim(),
      members: Math.max(this.teamForm.members || 4, activeMembersList.length),
      status: 'In Competition',
      school_name: this.schoolName
    };

    const done = (dbTeam: any) => {
      const newTeam: any = {
        id: dbTeam?.id || this.teamForm.id || `team-${Date.now()}`,
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
        user: getAuthValue('activeUserEmail') || 'School Admin',
        time: new Date().toISOString(),
        type: 'approval'
      });
      this.contentService.saveAuditLogs(currentAudit);

      this.closeAddTeamModal();
    };

    if (this.editingTeamOriginalName) {
      const existingTeam = this.contentService.teams.find(t => t.name === this.editingTeamOriginalName && t.schoolName === this.schoolName);
      if (existingTeam && existingTeam.id && !existingTeam.id.startsWith('temp-')) {
        this.apiService.updateTeam(existingTeam.id, teamPayload).subscribe({
          next: (res) => done({ id: existingTeam.id }),
          error: (err) => {
            console.error('Failed to update team in backend:', err);
            this.dialogService.toast('Failed to save team updates to database.', 'error');
          }
        });
      } else {
        done(null);
      }
    } else {
      this.apiService.createTeam(teamPayload).subscribe({
        next: (res) => done(res),
        error: (err) => {
          console.error('Failed to create team in backend:', err);
          this.dialogService.toast('Failed to create team in database.', 'error');
        }
      });
    }
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

  getUserRoleLabel(u: any): string {
    if (this.contentService.isGroupLeadUser(u)) return 'Group';
    return this.getRoleLabel(u?.role);
  }

  getUserRoleIcon(u: any): string {
    if (this.contentService.isGroupLeadUser(u)) return 'groups';
    return this.getRoleIcon(u?.role);
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

  // ── LMS Management ────────────────────────────────────────
  isLmsCourseModalOpen = false;
  isLmsModuleModalOpen = false;
  isLmsMaterialModalOpen = false;
  isLmsAssignmentModalOpen = false;

  lmsCourseForm: any = { title: '', description: '', track: 'coding', icon: 'menu_book', level: 'Beginner', status: 'active' };
  lmsModuleForm: any = { title: '', description: '', courseId: '', order: 1, icon: 'view_list', status: 'published' };
  lmsMaterialForm: any = { title: '', description: '', courseId: '', moduleId: '', type: 'document', url: '' };
  lmsAssignmentForm: any = { title: '', description: '', courseId: '', track: 'coding', dueDate: '', maxScore: 100, status: 'active' };

  getLmsCourseTitle(id: string): string {
    return this.contentService.lmsCourses.find(c => c.id === id)?.title || 'Unknown';
  }

  getLmsModuleTitle(id: string): string {
    return this.contentService.lmsModules.find(m => m.id === id)?.title || 'Unknown';
  }

  getModulesForCourse(courseId: string): any[] {
    return this.contentService.lmsModules.filter(m => m.courseId === courseId).sort((a, b) => a.order - b.order);
  }

  openLmsCourseModal(course?: any): void {
    this.lmsFormMode = course ? 'edit' : 'add';
    this.lmsCourseForm = course ? { ...course } : { title: '', description: '', track: 'coding', icon: 'menu_book', level: 'Beginner', status: 'active' };
    this.isLmsCourseModalOpen = true;
  }

  closeLmsCourseModal(): void { this.isLmsCourseModalOpen = false; }

  saveLmsCourse(): void {
    if (!this.lmsCourseForm.title?.trim()) { this.dialogService.toast('Course title is required.', 'warning'); return; }
    const course = {
      id: this.lmsFormMode === 'edit' ? this.lmsCourseForm.id : 'crs-' + Date.now(),
      ...this.lmsCourseForm,
      modules: this.lmsFormMode === 'edit' ? this.lmsCourseForm.modules : 0,
      enrolled: this.lmsFormMode === 'edit' ? this.lmsCourseForm.enrolled : 0,
      completion: this.lmsFormMode === 'edit' ? this.lmsCourseForm.completion : 0,
      createdAt: this.lmsFormMode === 'edit' ? this.lmsCourseForm.createdAt : new Date().toISOString().split('T')[0]
    };
    this.contentService.saveLmsCourse(course);
    this.dialogService.toast(`Course "${course.title}" saved successfully.`, 'success');
    this.closeLmsCourseModal();
  }

  async removeLmsCourse(id: string): Promise<void> {
    const ok = await this.dialogService.confirm({
      title: 'Delete LMS Course',
      message: 'Delete this course and all its modules, materials, and assignments?',
      confirmText: 'Delete Course',
      type: 'danger'
    });
    if (ok) {
      this.contentService.removeLmsCourse(id);
      this.dialogService.toast('Course removed.', 'info');
    }
  }

  openLmsModuleModal(mod?: any): void {
    this.lmsFormMode = mod ? 'edit' : 'add';
    this.lmsModuleForm = mod ? { ...mod } : { title: '', description: '', courseId: '', order: 1, icon: 'view_list', status: 'published' };
    this.isLmsModuleModalOpen = true;
  }

  closeLmsModuleModal(): void { this.isLmsModuleModalOpen = false; }

  saveLmsModule(): void {
    if (!this.lmsModuleForm.title?.trim()) { this.dialogService.toast('Module title is required.', 'warning'); return; }
    if (!this.lmsModuleForm.courseId) { this.dialogService.toast('Please select a course.', 'warning'); return; }
    const mod = {
      id: this.lmsFormMode === 'edit' ? this.lmsModuleForm.id : 'mod-' + Date.now(),
      ...this.lmsModuleForm
    };
    this.contentService.saveLmsModule(mod);
    this.dialogService.toast(`Module "${mod.title}" saved.`, 'success');
    this.closeLmsModuleModal();
  }

  async removeLmsModule(id: string): Promise<void> {
    const ok = await this.dialogService.confirm({
      title: 'Delete Module',
      message: 'Delete this module and its materials?',
      confirmText: 'Delete Module',
      type: 'danger'
    });
    if (ok) {
      this.contentService.removeLmsModule(id);
      this.dialogService.toast('Module removed.', 'info');
    }
  }

  openLmsMaterialModal(mat?: any): void {
    this.lmsFormMode = mat ? 'edit' : 'add';
    this.lmsMaterialForm = mat ? { ...mat } : { title: '', description: '', courseId: '', moduleId: '', type: 'document', url: '' };
    this.isLmsMaterialModalOpen = true;
  }

  closeLmsMaterialModal(): void { this.isLmsMaterialModalOpen = false; }

  saveLmsMaterial(): void {
    if (!this.lmsMaterialForm.title?.trim()) { this.dialogService.toast('Material title is required.', 'warning'); return; }
    if (!this.lmsMaterialForm.courseId) { this.dialogService.toast('Please select a course.', 'warning'); return; }
    const mat = {
      id: this.lmsFormMode === 'edit' ? this.lmsMaterialForm.id : 'mat-' + Date.now(),
      ...this.lmsMaterialForm,
      createdAt: this.lmsFormMode === 'edit' ? this.lmsMaterialForm.createdAt : new Date().toISOString().split('T')[0]
    };
    this.contentService.saveLmsMaterial(mat);
    this.dialogService.toast(`Material "${mat.title}" saved.`, 'success');
    this.closeLmsMaterialModal();
  }

  async removeLmsMaterial(id: string): Promise<void> {
    const ok = await this.dialogService.confirm({
      title: 'Delete Material',
      message: 'Delete this material?',
      confirmText: 'Delete Material',
      type: 'danger'
    });
    if (ok) {
      this.contentService.removeLmsMaterial(id);
      this.dialogService.toast('Material removed.', 'info');
    }
  }

  openLmsAssignmentModal(asgn?: any): void {
    this.lmsFormMode = asgn ? 'edit' : 'add';
    this.lmsAssignmentForm = asgn ? { ...asgn } : { title: '', description: '', courseId: '', track: 'coding', dueDate: '', maxScore: 100, status: 'active' };
    this.isLmsAssignmentModalOpen = true;
  }

  closeLmsAssignmentModal(): void { this.isLmsAssignmentModalOpen = false; }

  saveLmsAssignment(): void {
    if (!this.lmsAssignmentForm.title?.trim()) { this.dialogService.toast('Assignment title is required.', 'warning'); return; }
    if (!this.lmsAssignmentForm.courseId) { this.dialogService.toast('Please select a course.', 'warning'); return; }
    const asgn = {
      id: this.lmsFormMode === 'edit' ? this.lmsAssignmentForm.id : 'asgn-' + Date.now(),
      ...this.lmsAssignmentForm,
      createdAt: this.lmsFormMode === 'edit' ? this.lmsAssignmentForm.createdAt : new Date().toISOString().split('T')[0]
    };
    this.contentService.saveLmsAssignment(asgn);
    this.dialogService.toast(`Assignment "${asgn.title}" saved.`, 'success');
    this.closeLmsAssignmentModal();
  }

  async removeLmsAssignment(id: string): Promise<void> {
    const ok = await this.dialogService.confirm({
      title: 'Delete Assignment',
      message: 'Delete this assignment?',
      confirmText: 'Delete Assignment',
      type: 'danger'
    });
    if (ok) {
      this.contentService.removeLmsAssignment(id);
      this.dialogService.toast('Assignment removed.', 'info');
    }
  }
}

// trigger hot reload