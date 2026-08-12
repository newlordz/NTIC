import { getAuthValue } from './session.util';
import { Injectable } from '@angular/core';
import { DataStorageService } from './data-storage.service';
import { ApiService } from './api.service';
import { WsSyncService } from './ws-sync.service';

export interface UpcomingEvent {
  id: string;
  month: string;
  day: string;
  title: string;
  description: string;
  location: string;
}

export interface ChampionshipStory {
  id: string;
  tag: string;
  tagColor: string; // 'robotics' | 'coding' | 'cyber' | 'ai' | 'innovation' | ''
  image: string;
  date: string;
  readTime: string;
  title: string;
  body: string;
  likes?: number;
  likedBy?: string[];
}

export interface HallOfFameEntry {
  id: string;
  type?: 'individual' | 'group'; // 'individual' by default if undefined
  initials: string;
  name: string; // Used as display title or individual name
  teamName?: string; // Optional team/squad name
  projectTitle?: string; // Optional project title
  members?: string[]; // Array of member names for groups
  school: string;
  logoUrl?: string; // Optional school logo URL
  year: string;
  badge: string;
  trackClass: string; // 'coding-track' | 'robotics-track' | 'ai-track' | 'cyber-track' | 'innovation-track'
  expiryDate?: string;
}

export interface LeaderboardEntry {
  id: string;
  rank: string;
  schoolName: string;
  location: string;
  points: number;
  trackPoints: {
    all: number;
    coding: number;
    robotics: number;
    ai: number;
    cyber: number;
  };
  region: string;
}

export interface TalentDiscovery {
  id: string;
  category: string;
  studentName: string;
  schoolAndGrade: string;
  score: string;
  badgeColor: string; // 'primary' | 'secondary' | 'ai' | 'error' | etc.
}

export interface CompetitionPhase {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  type: 'registration' | 'submission' | 'judging' | 'results' | 'break';
  status: 'pending' | 'active' | 'completed';
}

export interface Competition {
  id: string;
  title: string;
  description?: string;
  track: string;
  icon: string;
  category: string;
  teams: number;
  maxTeams?: number;
  deadline: string;
  startDate?: string;
  endDate?: string;
  prize: string;
  status: 'draft' | 'active' | 'registration' | 'completed' | 'archived';
  progress: number;
  type?: 'qualifier' | 'quarter-final' | 'semi-final' | 'final' | 'championship';
  phases?: CompetitionPhase[];
  rules?: string;
  criteria?: string;
  createdAt?: string;
}

export interface PhilosophyCard {
  id: string;
  title: string;
  description: string;
  image: string;
}

export interface LmsCourse {
  id: string;
  title: string;
  track: string;
  icon: string;
  level: string;
  description: string;
  modules: number;
  enrolled: number;
  completion: number;
  status: 'active' | 'draft' | 'archived';
  createdAt: string;
  submittedBy?: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface LmsModule {
  id: string;
  courseId: string;
  title: string;
  description: string;
  order: number;
  icon: string;
  status: 'published' | 'draft';
  submittedBy?: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface LmsMaterial {
  id: string;
  courseId: string;
  moduleId: string;
  title: string;
  type: 'document' | 'video' | 'link' | 'file';
  url: string;
  description: string;
  createdAt: string;
  submittedBy?: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface LmsAssignment {
  id: string;
  courseId: string;
  title: string;
  description: string;
  dueDate: string;
  maxScore: number;
  track: string;
  status: 'active' | 'draft' | 'closed';
  createdAt: string;
  submittedBy?: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface LmsSubmission {
  id: string;
  assignmentId: string;
  courseId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  submittedAt: string;
  content: string;
  url: string;
  score?: number;
  status: 'submitted' | 'graded' | 'late' | 'resubmitted' | 'regrade_requested' | 'rejected';
  feedback?: string;
}

export interface LmsEnrollment {
  id: string;
  courseId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  progressPct: number;
  enrolledAt: string;
  lastActive: string;
  status: 'active' | 'completed' | 'dropped';
}

export interface PlatformStats {
  regions: number;
  mentors: number;
  schools: number;
  students: number;       // in thousands
  projects: number;       // in thousands (1 decimal)
  grants: number;         // in millions
}

export interface HeroSlide {
  id: string;
  tag: string;
  title: string;
  description: string;
  image: string;
  imageFileId?: string;
  videoFileId?: string;
  videoUrl?: string;
  videoThumbnail?: string;
  ctaText: string;
  ctaLink: string;
}

export interface NewsFeedItem {
  id: string;
  headline: string;
  tag: string;
  date: string;
  link: string;
}

export interface SponsorPayment {
  id: string;
  refNo: string;
  amount: string;
  method: 'Mobile Money' | 'Bank Transfer' | 'Corporate Cheque' | 'Card Online';
  status: 'Confirmed' | 'Pending Verification' | 'Processing';
  date: string;
  notes?: string;
}

export interface User {
  id: string;
  role: 'super_admin' | 'admin' | 'content_manager' | 'reviewer' | 'competition_manager' | 'school_admin' | 'instructor' | 'student' | 'judge' | 'sponsor';
  registrationMode?: 'group' | 'individual';
  fullName: string;
  email: string;
  phone: string;
  guardianName?: string;
  guardianPhone?: string;
  photoFileId?: string;
  password?: string;
  otp: string;
  mustSetPassword?: boolean;
  passwordChanged?: boolean;
  organization: string;
  region?: string;
  track?: string;
  tier?: string;
  ticket: string;
  applicationCode?: string;
  status: string;
  registeredAt: string;
  lastLogin: string;
  skills?: { alg: string; hw: string; ai: string };
  total?: string;
  package?: string;
  payments?: SponsorPayment[];
}

export interface ApprovalRequest {
  id: string;
  type: 'School Registration' | 'Team Addition' | 'Student Registration' | 'Instructor Access';
  entity: string;
  contact: string;
  submitted: string;
  details: {
    region?: string;
    district?: string;
    category?: string;
    phone?: string;
    email?: string;
    gps?: string;
    gpsAddress?: string;
    repName?: string;
    repEmail?: string;
    repTel?: string;
    code?: string;
    tracks?: string;
    docs?: string[];
    infra?: string;
    logo?: string;
    logoFileId?: string;
    studentCount?: number;
    students?: { name: string; track: string; class: string; guardianName?: string; guardianPhone?: string }[];
    school?: string;
    track?: string;
    project?: string;
    members?: string[];
    memberEmails?: string[];
    leadEmail?: string;
    coach?: string;
    photoFileId?: string;
    memberPhotos?: string[];
    skills?: any;
    dob?: string;
    gender?: string;
    guardianName?: string;
    guardianPhone?: string;
    class?: string;
    institution?: string;
    credentials?: string;
    specialization?: string;
    experience?: string;
    courses?: string[];
    teamsList?: any[];
    name?: string;
    expertise?: string;
    bio?: string;
    sector?: string;
    amount?: string;
    tier?: string;
  };
  reviewedAt?: string;
  reviewer?: string;
  rejectionReasons?: string;
  rejectionNotes?: string;
}

export type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'not_found';

export interface ApplicationStatusResult {
  status: ApplicationStatus;
  application?: ApprovalRequest;
  rejectedDetails?: { reasons: string; notes: string; reviewedAt: string } | null;
}

export interface Team {
  id?: string;
  name: string;
  track: string;
  lead: string;
  members: number;
  status: string;
  schoolName?: string;
  region?: string;
  photoFileId?: string;
  logoFileId?: string;
  mentor?: string;
  motto?: string;
  rosterList?: string[];
  memberNames?: string[];
  memberList?: string[];
  memberPhotos?: string[];
  skills?: { alg: string; hw: string; ai: string };
}

export interface Submission {
  id: string;
  student: string;
  school: string;
  assignment: string;
  track: string;
  file: string;
  score: number | null;
  status: 'pending' | 'approved' | 'resubmission' | 'NeedsResubmission';
  time: string;
  feedback?: string;
  videoUrl?: string;
  sourceCodePath?: string;
  backendId?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ContentService {

  private readonly CACHE_VERSION_KEY = 'ntic_cache_version';
  private readonly CURRENT_CACHE_VERSION = 'ntic-cache-v3';
  private readonly CONTENT_CACHE_KEYS = [
    'championshipStories','upcomingEvents','hallOfFameEntries','leaderboardData',
    'talentDiscovery','platformStats','heroSlides','newsFeedItems','countdownDate',
    'users','pendingApprovals','rejectedApprovals','approvedApprovals','teams',
    'submissions','auditLogs','csrUpdates','competitions','philosophyCards',
    'lmsCourses','lmsModules','lmsMaterials','lmsAssignments','lmsSubmissions','lmsEnrollments'
  ];
  private needsIdbPurge = false;
  private _syncInterval: any = null;

  // ── Championship Stories ─────────────────────────────────────
  championshipStories: ChampionshipStory[] = [];
  
  // ── Hall of Fame ─────────────────────────────────────────────
  hallOfFameEntries: HallOfFameEntry[] = [];

  // ── Upcoming Events ───────────────────────────────────────────
  upcomingEvents: UpcomingEvent[] = [];

  // ── Leaderboard ──────────────────────────────────────────────
  leaderboardData: LeaderboardEntry[] = [];

  // ── Talent Discovery ──────────────────────────────────────────
  talentDiscovery: TalentDiscovery[] = [];

  // ── Platform Stats ───────────────────────────────────────────
  platformStats: PlatformStats = {
    regions: 0,
    mentors: 0,
    schools: 0,
    students: 0,
    projects: 0,
    grants: 0
  };

  countdownDate: string = '2026-08-15T09:00:00';

  // ── Hero Slides ──────────────────────────────────────────────
  heroSlides: HeroSlide[] = [];

  // ── News Feed ────────────────────────────────────────────────
  newsFeedItems: NewsFeedItem[] = [];

  // ── Shared Persistent Collections ────────────────────────────
  users: User[] = [];
  userCount = 0;
  pendingApprovals: ApprovalRequest[] = [];
  rejectedApprovals: ApprovalRequest[] = [];
  approvedApprovals: ApprovalRequest[] = [];
  teams: Team[] = [];
  submissions: Submission[] = [];
  auditLogs: any[] = [];
  csrUpdates: any[] = [];
  competitions: Competition[] = [];

  // ── Philosophy Cards (Learn. Innovate. Build.) ─────────────
  philosophyCards: PhilosophyCard[] = [];

  // ── LMS Data ──────────────────────────────────────────────
  lmsCourses: LmsCourse[] = [];
  lmsModules: LmsModule[] = [];
  lmsMaterials: LmsMaterial[] = [];
  lmsAssignments: LmsAssignment[] = [];
  lmsSubmissions: LmsSubmission[] = [];
  lmsEnrollments: LmsEnrollment[] = [];

  // ── Initial Mock Data backups for restoration ──────────────────
  private readonly defaultCompetitions: Competition[] = [];
  private readonly defaultPhilosophyCards: PhilosophyCard[] = [
    { id: 'phil-1', title: 'Learn', description: 'Pushing the boundaries of what is known to uncover new possibilities.', image: 'assets/ntic_image_14.jpeg' },
    { id: 'phil-2', title: 'Innovate', description: 'Designing intelligent, creative solutions for tomorrow\'s challenges.', image: 'assets/ntic_image_25.jpeg' },
    { id: 'phil-3', title: 'Build', description: 'Turning abstract ideas into concrete reality through engineering.', image: 'assets/ntic_image_33.jpeg' },
  ];

private readonly defaultLmsCourses: LmsCourse[] = [];

private readonly defaultLmsModules: LmsModule[] = [];

  private readonly defaultLmsMaterials: LmsMaterial[] = [];

private readonly defaultLmsAssignments: LmsAssignment[] = [];

  private readonly defaultLmsSubmissions: LmsSubmission[] = [];

  private readonly defaultLmsEnrollments: LmsEnrollment[] = [];
  private readonly defaultEvents: UpcomingEvent[] = [];
  private readonly defaultStories: ChampionshipStory[] = [];

  private readonly defaultHof: HallOfFameEntry[] = [];

  private readonly defaultLeaderboard: LeaderboardEntry[] = [];

  private readonly defaultTalentDiscovery: TalentDiscovery[] = [];

  private readonly defaultStats: PlatformStats = { regions: 0, mentors: 0, schools: 0, students: 0, projects: 0, grants: 0 };

  private readonly defaultHero: HeroSlide[] = [
    { id: 'slide-1', tag: 'Ghana\'s Premier Tech Championship', title: 'National Tech Innovation Championship 2026', description: 'Empowering the next generation of Ghanaian innovators through Coding, Robotics, AI, Networking & Cybersecurity, and Open Innovation.', image: 'assets/ntic_image_1.jpeg', ctaText: 'Enter Portal', ctaLink: '#portal' },
    { id: 'slide-2', tag: '500+ Schools Registered', title: 'Over 16 Regions Represented', description: 'From Accra to Tamale, young minds are competing to solve real-world problems with technology.', image: 'assets/ntic_image_4.jpeg', ctaText: 'Enter Portal', ctaLink: '#portal' },
    { id: 'slide-3', tag: 'Innovate. Build. Lead.', title: 'Ready to Make an Impact?', description: 'Join Ghana\'s largest high school tech competition. Registration is open for all tracks.', image: 'assets/ntic_image_7.jpeg', ctaText: 'Enter Portal', ctaLink: '#portal' }
  ];

  private readonly defaultNews: NewsFeedItem[] = [];

  private readonly defaultUsers: User[] = [
    {
      id: 'USR-000',
      role: 'super_admin',
      fullName: 'Admin',
      email: 'admin@ntic.org.gh',
      phone: '+233 20 000 0000',
      otp: '',
      organization: 'NTIC',
      ticket: 'NTIC-ADM-0000',
      status: 'Active',
      registeredAt: 'Jan 1, 2026',
      lastLogin: 'Just now'
    }
  ];

  private readonly defaultPendingApprovals: ApprovalRequest[] = [];
  private readonly defaultRejectedApprovals: ApprovalRequest[] = [];
  private readonly defaultApprovedApprovals: ApprovalRequest[] = [];

private readonly defaultTeams: Team[] = [];

  private readonly defaultSubmissions: Submission[] = [];

  private readonly defaultAuditLogs = [];

  private readonly defaultCsrUpdates = [];

  private storageReady = false;

  private enrichHofEntries(entries: HallOfFameEntry[]): HallOfFameEntry[] {
    if (!Array.isArray(entries)) return entries;
    return entries.map(entry => {
      const isGroupBadge = entry.badge && (entry.badge.toLowerCase().includes('squad') || entry.badge.toLowerCase().includes('team') || entry.badge.toLowerCase().includes('group'));
      const type = entry.type || (isGroupBadge ? 'group' : 'individual');
      
      let members = entry.members;

      return {
        ...entry,
        type,
        members: members || []
      };
    });
  }

  constructor(private dataStorage: DataStorageService, private apiService: ApiService, private wsSync: WsSyncService) {
    this.purgeStaleCache();
    this.loadStateAndFallback();
      this.loadFromBackend();
    this.migrateToIndexedDB();

    // ── Real-time sync across machines/tabs ──────────────────────────
    // Push from backend → instant refresh when another admin changes data
    this.wsSync.dataChanged$.subscribe(() => this.loadFromBackend());

    // Connect WebSocket + trigger initial load immediately
    if (getAuthValue('activeUserToken')) {
      this.wsSync.connect();
    }

    const tick = () => {
      if (getAuthValue('activeUserToken')) {
        this.loadFromBackend();
        this.wsSync.connect();
      }
    };

    // Poll every 15s + reconnect WebSocket (belt-and-suspenders)
    this._syncInterval = setInterval(tick, 15000);

    // Refresh when the user switches back to this tab
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') tick();
      });
    }
  }

  private purgeStaleCache(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const storedVersion = localStorage.getItem(this.CACHE_VERSION_KEY);
      if (storedVersion === this.CURRENT_CACHE_VERSION) return;

      // Version mismatch or first run -- drop all cached content so the
      // freshly built defaults (NTI branding) take effect.
      this.CONTENT_CACHE_KEYS.forEach(key => {
        try { localStorage.removeItem(key); } catch { /* ignore */ }
      });
      localStorage.setItem(this.CACHE_VERSION_KEY, this.CURRENT_CACHE_VERSION);
      this.needsIdbPurge = true;
    } catch { /* storage unavailable -- skip */ }
  }

  refreshBackendData(): void {
    this.loadFromBackend();
  }

  syncToBackend(collection: string, items: any[]): void {
    this.apiService.bulkSync(collection, items).subscribe({
      next: () => {},
      error: () => {}
    });
  }

  private loadFromBackend(): void {
    // Users -- replace entirely from backend (source of truth)
    this.apiService.getUsers().subscribe({
      next: (backendUsers: any[]) => {
        const total = backendUsers ? backendUsers.length : 0;
        if (total > 0) {
          const mapped: User[] = backendUsers.map((u: any) => ({
            id: u.id,
            email: u.email,
            fullName: u.full_name || 'Unknown',
            phone: u.phone || '',
            otp: '',
            organization: u.organization || '',
            role: u.role || 'student',
            ticket: u.ticket || '',
            status: u.status || 'Active',
            registeredAt: u.created_at || '',
            lastLogin: ''
          }));
          this.users = mapped;
          this.saveState('users', mapped);
        }
        this.userCount = total;
        this.saveState('userCount', total);
      },
      error: () => console.log('Backend users fallback to local cache')
    });
    this.apiService.getEvents().subscribe({
      next: (events: any) => {
        if (events && events.length > 0) this.upcomingEvents = events;
      },
      error: (e: any) => console.log('Backend events fallback to local cache')
    });

    this.apiService.getStories().subscribe({
      next: (stories: any) => {
        if (stories && stories.length > 0) this.championshipStories = stories;
      },
      error: (e: any) => console.log('Backend stories fallback to local cache')
    });

    this.apiService.getPhilosophy().subscribe({
      next: (cards: any) => {
        if (cards && cards.length > 0) this.philosophyCards = cards;
      },
      error: (e: any) => console.log('Backend philosophy fallback to local cache')
    });

    // Load platform stats and countdown from backend
    this.apiService.getPlatformStats().subscribe({
      next: (stats: any) => {
        if (stats) {
          if (stats.regions !== undefined) {
            this.platformStats = { regions: stats.regions, mentors: stats.mentors, schools: stats.schools, students: stats.students, projects: stats.projects, grants: stats.grants };
            this.saveState('platformStats', this.platformStats);
          }
          if (stats.countdownDate) {
            this.countdownDate = stats.countdownDate;
            this.saveState('countdownDate', this.countdownDate);
          }
        }
      },
      error: () => {}
    });

    this.apiService.getHeroSlides().subscribe({
      next: (slides: any[]) => {
        if (slides && slides.length > 0) {
          this.heroSlides = slides;
          this.saveState('heroSlides', this.heroSlides);
        }
      },
      error: () => {}
    });

    this.apiService.getTalent().subscribe({
      next: (items: any[]) => {
        if (items && items.length > 0) {
          this.talentDiscovery = items;
          this.saveState('talentDiscovery', this.talentDiscovery);
        }
      },
      error: () => {}
    });

    this.apiService.getCsrUpdates().subscribe({
      next: (items: any[]) => {
        if (items && items.length > 0) {
          this.csrUpdates = items;
          this.saveState('csrUpdates', this.csrUpdates);
        }
      },
      error: () => {}
    });

    this.apiService.getStudents().subscribe({
      next: (students: any[]) => {
        // Students are for leaderboard/competitions, NOT for the admin Users list.
        // Users now sync from GET /api/users above.
      },
      error: (e: any) => console.log('Backend students fallback to local cache')
    });

    this.apiService.getCompetitions().subscribe({
      next: (comps: any[]) => {
        if (comps && comps.length > 0) {
          const merged = this.mergeCompetitions(comps);
          this.competitions = merged;
          this.saveState('competitions', merged);
        }
      },
      error: (e: any) => console.log('Backend competitions fallback to local cache')
    });

    this.apiService.getTeams().subscribe({
      next: (teams: any[]) => {
        if (teams && teams.length > 0) {
          const merged = this.mergeTeams(teams);
          this.teams = merged;
          this.saveState('teams', merged);
        }
      },
      error: (e: any) => console.log('Backend teams fallback to local cache')
    });

    this.apiService.getSubmissions().subscribe({
      next: (subs: any[]) => {
        if (subs && subs.length > 0) {
          const merged = this.mergeSubmissions(subs);
          this.submissions = merged;
          this.saveState('submissions', merged);
        }
      },
      error: (e: any) => console.log('Backend submissions fallback to local cache')
    });

    this.apiService.getSchools().subscribe({
      next: (schools: any[]) => {
        if (schools && schools.length > 0) {
          const merged = this.mergeLeaderboardFromSchools(schools);
          if (merged.length > 0) {
            this.leaderboardData = merged;
            this.saveState('leaderboardData', merged);
          }
        }
      },
      error: (e: any) => console.log('Backend schools->leaderboard fallback to local cache')
    });

    this.apiService.getHof().subscribe({
      next: (entries: any[]) => {
        if (entries && entries.length > 0) {
          // Backend is the source of truth -- REPLACE, don't merge, so stale local/test entries never resurface
          this.hallOfFameEntries = this.enrichHofEntries(entries.map((b: any) => ({
            id: b.id,
            type: b.type || 'individual',
            initials: b.initials || '',
            name: b.name || '',
            teamName: b.team_name || '',
            projectTitle: b.project_title || '',
            members: b.members || [],
            school: b.school || '',
            year: b.year || '',
            badge: b.badge || '',
            trackClass: b.track_class || '',
            expiryDate: b.expiry_date || ''
          })));
          this.saveState('hallOfFameEntries', this.hallOfFameEntries);
        }
      },
      error: (e: any) => console.log('Backend hof fallback to local cache')
    });

    this.apiService.getNewsItems().subscribe({
      next: (items: any[]) => {
        if (items && items.length > 0) {
          const existing = new Map<string, any>();
          this.newsFeedItems.forEach(n => existing.set(n.id, n));
          items.forEach((n: any) => { if (!existing.has(n.id)) existing.set(n.id, n); });
          this.newsFeedItems = Array.from(existing.values());
          this.saveState('newsFeedItems', this.newsFeedItems);
        }
      },
      error: (e: any) => console.log('Backend news fallback to local cache')
    });

    this.apiService.getAuditLogs().subscribe({
      next: (logs: any[]) => {
        if (logs && logs.length > 0) {
          const existingIds = new Set(this.auditLogs.map((l: any) => l.id));
          const newLogs = logs.filter((l: any) => !existingIds.has(l.id));
          if (newLogs.length > 0) {
            this.auditLogs = [...newLogs, ...this.auditLogs];
            this.saveState('auditLogs', this.auditLogs);
          }
        }
      },
      error: (e: any) => console.log('Backend audit fallback to local cache')
    });

    this.apiService.getLmsCourses().subscribe({
      next: (courses: any[]) => {
        if (courses && courses.length > 0) {
          const merged = this.mergeLmsCourses(courses);
          if (merged.length > 0) {
            this.lmsCourses = merged;
            this.saveState('lmsCourses', merged);
          }
        }
      },
      error: (e: any) => console.log('Backend LMS fallback to local cache')
    });

    this.apiService.getApprovals().subscribe({
      next: (backendApprovals: any[]) => {
        if (backendApprovals && backendApprovals.length > 0) {
          const pending: any[] = [];
          const approved: any[] = [];
          const rejected: any[] = [];
          backendApprovals.forEach((a: any) => {
            const mapped = {
              id: a.id, type: a.type, entity: a.entity, contact: a.contact,
              submitted: a.submitted, details: a.details || {},
              reviewedAt: a.reviewedAt, reviewer: a.reviewer,
              rejectionReasons: a.rejectionReasons, rejectionNotes: a.rejectionNotes
            };
            if (a.status === 'pending') pending.push(mapped);
            else if (a.status === 'approved') approved.push(mapped);
            else if (a.status === 'rejected') rejected.push(mapped);
          });
          if (pending.length > 0) this.saveApprovals(pending);
          if (approved.length > 0) this.saveApprovedApprovals(approved);
          if (rejected.length > 0) this.saveRejectedApprovals(rejected);
        }
      },
      error: () => {}
    });

    this.apiService.getUsers().subscribe({
      next: (backendUsers: any[]) => {
        if (backendUsers && backendUsers.length > 0) {
          const current = [...this.users];
          backendUsers.forEach(bu => {
            if (!current.some(u => u.id === bu.id)) {
              current.push({
                id: bu.id,
                fullName: bu.full_name || 'User',
                email: bu.email || '',
                phone: '',
                otp: '',
                organization: '',
                ticket: bu.ticket || '',
                role: bu.role || 'student',
                status: bu.status || 'Active',
                registeredAt: bu.created_at || new Date().toISOString(),
                lastLogin: new Date().toISOString()
              });
            }
          });
          if (current.length > this.users.length) this.saveUsers(current);
        }
      },
      error: (e: any) => console.log('Backend users fallback to local cache')
    });
  }

  private mergeSubmissions(backendSubs: any[]): Submission[] {
    const localById = new Map<string, Submission>();
    this.submissions.forEach(s => localById.set(s.id, s));
    backendSubs.forEach((b: any) => {
      if (!localById.has(b.id)) {
        localById.set(b.id, {
          id: b.id,
          student: b.student_id || 'Unknown Student',
          school: '',
          assignment: b.source_code_path || '',
          track: '',
          file: b.source_code_path || '',
          score: b.score ?? null,
          status: b.status || 'pending',
          time: b.created_at || '',
          feedback: b.feedback || '',
          videoUrl: b.video_url || '',
          sourceCodePath: b.source_code_path || '',
          backendId: b.id
        });
      }
    });
    return Array.from(localById.values());
  }

  private mergeLeaderboardFromSchools(schools: any[]): LeaderboardEntry[] {
    const existing = new Map<string, LeaderboardEntry>();
    this.leaderboardData.forEach(e => existing.set(e.id, e));
    schools.forEach((s: any) => {
      const allScore = s.score || 100;
      if (!existing.has(s.id)) {
        existing.set(s.id, {
          id: s.id,
          rank: String(s.rank || 99).padStart(2, '0'),
          schoolName: s.name || 'Unknown School',
          location: s.region || '',
          points: allScore,
          trackPoints: {
            all: allScore,
            coding: s.coding_score ?? 0,
            robotics: s.robotics_score ?? 0,
            ai: s.ai_score ?? 0,
            cyber: s.cyber_score ?? 0
          },
          region: s.region || ''
        });
      } else {
        const e = existing.get(s.id)!;
        e.points = Math.max(e.points, allScore);
        if (s.region) e.region = s.region;
        e.trackPoints.all = Math.max(e.trackPoints.all, allScore);
        e.trackPoints.coding = Math.max(e.trackPoints.coding, s.coding_score ?? 0);
        e.trackPoints.robotics = Math.max(e.trackPoints.robotics, s.robotics_score ?? 0);
        e.trackPoints.ai = Math.max(e.trackPoints.ai, s.ai_score ?? 0);
        e.trackPoints.cyber = Math.max(e.trackPoints.cyber, s.cyber_score ?? 0);
      }
    });
    return Array.from(existing.values()).sort((a, b) => b.points - a.points);
  }

  private mergeLmsCourses(backendCourses: any[]): LmsCourse[] {
    const localById = new Map<string, LmsCourse>();
    this.lmsCourses.forEach(c => localById.set(c.id, c));
    backendCourses.forEach((b: any) => {
      if (!localById.has(b.id)) {
        localById.set(b.id, {
          id: b.id,
          title: b.title || '',
          track: b.track || '',
          icon: b.icon || '',
          level: b.level || '',
          description: b.description || '',
          modules: b.modules || 0,
          enrolled: b.enrolled || 0,
          completion: b.completion || 0,
          status: b.status || 'active',
          createdAt: b.created_at || '',
          submittedBy: b.submitted_by || '',
          approvalStatus: b.approval_status || 'approved',
          rejectionReason: b.rejection_reason || ''
        });
      }
    });
    return Array.from(localById.values());
  }

  private mergeCompetitions(backendComps: any[]): Competition[] {
    const localById = new Map<string, Competition>();
    this.competitions.forEach(c => localById.set(c.id, c));
    backendComps.forEach((b: any) => {
      localById.set(b.id, {
        id: b.id,
        title: b.title || 'Untitled Competition',
        description: b.description || '',
        track: b.track || 'Coding',
        icon: 'emoji_events',
        category: b.category || '',
        teams: b.teams || 0,
        maxTeams: b.maxTeams || 50,
        deadline: b.deadline || '',
        prize: b.prize || '',
        type: b.type || 'qualifier',
        startDate: b.startDate || '',
        endDate: b.endDate || '',
        phases: typeof b.phases === 'string' ? JSON.parse(b.phases || '[]') : (b.phases || []),
        rules: b.rules || '',
        criteria: b.criteria || '',
        status: (b.status === 'active' ? 'active' : b.status === 'registration' ? 'registration' : b.status === 'completed' ? 'completed' : b.status === 'draft' ? 'draft' : 'archived'),
        progress: b.progress || 0,
        createdAt: b.created_at || new Date().toISOString()
      });
    });
    return Array.from(localById.values());
  }

  private mergeTeams(backendTeams: any[]): Team[] {
    const localById = new Map<string, Team>();
    this.teams.forEach(t => { if (t.id) localById.set(t.id, t); });
    backendTeams.forEach((b: any) => {
      localById.set(b.id, {
        id: b.id,
        name: b.name || 'Untitled Team',
        track: b.track || 'Coding',
        lead: b.lead || 'Team Lead',
        members: b.members ?? 1,
        status: b.status || 'Active',
        schoolName: b.school_name || ''
      });
    });
    return Array.from(localById.values());
  }
  private loadStateAndFallback(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      // Clear stale localStorage cache if version bumped (prevents old mock data lingering)
      const DATA_VERSION = '2';
      if (localStorage.getItem('_dataVersion') !== DATA_VERSION) {
        const keysToClear = ['championshipStories','upcomingEvents','hallOfFameEntries','leaderboardData',
          'talentDiscovery','platformStats','heroSlides','newsFeedItems','countdownDate'];
        keysToClear.forEach(k => localStorage.removeItem(k));
        localStorage.setItem('_dataVersion', DATA_VERSION);
      }
      // Load from localStorage first for instant render.
      // loadFromBackend() refreshes all collections from the API immediately after.
      this.championshipStories = this.loadKeySync('championshipStories', this.defaultStories);
      this.hallOfFameEntries = [];
      this.upcomingEvents = this.loadKeySync('upcomingEvents', this.defaultEvents);
      this.leaderboardData = this.loadKeySync('leaderboardData', this.defaultLeaderboard);
      this.talentDiscovery = this.loadKeySync('talentDiscovery', this.defaultTalentDiscovery);
      this.platformStats = this.loadKeySync('platformStats', this.defaultStats);
      this.heroSlides = this.loadKeySync('heroSlides', this.defaultHero);
      this.newsFeedItems = this.loadKeySync('newsFeedItems', this.defaultNews);
      this.users = [...this.defaultUsers];

      const savedCountdown = localStorage.getItem('countdownDate');
      this.countdownDate = savedCountdown || '2026-08-15T09:00:00';

      // Large datasets -- load from localStorage first (sync), then async upgrade to IndexedDB
      // Users are NOT loaded from localStorage -- always fresh from backend sync
      this.pendingApprovals = this.loadKeySync('pendingApprovals', this.defaultPendingApprovals);
      this.rejectedApprovals = this.loadKeySync('rejectedApprovals', this.defaultRejectedApprovals);
      this.approvedApprovals = this.loadKeySync('approvedApprovals', this.defaultApprovedApprovals);
      this.teams = this.loadKeySync('teams', this.defaultTeams);
      this.submissions = this.loadKeySync('submissions', this.defaultSubmissions);
      this.auditLogs = this.loadKeySync('auditLogs', this.defaultAuditLogs);
      this.csrUpdates = this.loadKeySync('csrUpdates', this.defaultCsrUpdates);
      this.competitions = this.loadKeySync('competitions', this.defaultCompetitions);
      this.philosophyCards = this.loadKeySync('philosophyCards', this.defaultPhilosophyCards);
      this.lmsCourses = this.loadKeySync('lmsCourses', this.defaultLmsCourses);
      this.lmsModules = this.loadKeySync('lmsModules', this.defaultLmsModules);
      this.lmsMaterials = this.loadKeySync('lmsMaterials', this.defaultLmsMaterials);
      this.lmsAssignments = this.loadKeySync('lmsAssignments', this.defaultLmsAssignments);
      this.lmsSubmissions = this.loadKeySync('lmsSubmissions', this.defaultLmsSubmissions);
      this.lmsEnrollments = this.loadKeySync('lmsEnrollments', this.defaultLmsEnrollments);
    } else {
      this.championshipStories = [...this.defaultStories];
      this.hallOfFameEntries = [...this.defaultHof];
      this.upcomingEvents = [...this.defaultEvents];
      this.leaderboardData = [...this.defaultLeaderboard];
      this.talentDiscovery = [...this.defaultTalentDiscovery];
      this.platformStats = { ...this.defaultStats };
      this.heroSlides = [...this.defaultHero];
      this.newsFeedItems = [...this.defaultNews];
      this.users = [...this.defaultUsers];
      this.pendingApprovals = [...this.defaultPendingApprovals];
      this.rejectedApprovals = [...this.defaultRejectedApprovals];
      this.approvedApprovals = [...this.defaultApprovedApprovals];
      this.teams = [...this.defaultTeams];
      this.submissions = [...this.defaultSubmissions];
      this.auditLogs = [...this.defaultAuditLogs];
      this.csrUpdates = [...this.defaultCsrUpdates];
      this.competitions = [...this.defaultCompetitions];
      this.philosophyCards = [...this.defaultPhilosophyCards];
      this.lmsCourses = [...this.defaultLmsCourses];
      this.lmsModules = [...this.defaultLmsModules];
      this.lmsMaterials = [...this.defaultLmsMaterials];
      this.lmsAssignments = [...this.defaultLmsAssignments];
      this.lmsSubmissions = [...this.defaultLmsSubmissions];
      this.lmsEnrollments = [...this.defaultLmsEnrollments];
    }
  }

  private loadKeySync<T>(key: string, defaultValue: T): T {
    // First try localStorage (fast, synchronous)
    const item = localStorage.getItem(key);
    if (item) {
      try {
        return JSON.parse(item);
      } catch (e) {
        console.error('Failed to parse key: ' + key, e);
      }
    }
    return JSON.parse(JSON.stringify(defaultValue));
  }

  private async loadKeyAsync<T>(key: string, defaultValue: T): Promise<void> {
    try {
      const idbData = await this.dataStorage.get<T>(key);
      if (idbData !== null) {
        (this as any)[key] = idbData;
        return;
      }
    } catch { /* IndexedDB not available */ }

    // Fall back to localStorage and migrate
    const lsRaw = localStorage.getItem(key);
    if (lsRaw) {
      try {
        const parsed = JSON.parse(lsRaw) as T;
        (this as any)[key] = parsed;
        await this.dataStorage.set(key, parsed).catch(() => {});
        return;
      } catch { /* corrupt */ }
    }

    (this as any)[key] = JSON.parse(JSON.stringify(defaultValue));
    await this.dataStorage.set(key, defaultValue).catch(() => {});
  }

  private async migrateToIndexedDB(): Promise<void> {
    // Users always come fresh from backend -- never from cache
    const largeKeys = ['pendingApprovals', 'rejectedApprovals', 'approvedApprovals', 'teams', 'submissions', 'auditLogs'];
    if (this.needsIdbPurge) {
      this.needsIdbPurge = false;
      for (const key of largeKeys) {
        await this.dataStorage.remove(key).catch(() => {});
      }
    }
    for (const key of largeKeys) {
      await this.loadKeyAsync(key, (this as any)[key]);
    }
    this.storageReady = true;
  }

  private saveState(key: string, data: any): void {
    const json = JSON.stringify(data);
    const isLargeCollection = ['users', 'pendingApprovals', 'rejectedApprovals', 'approvedApprovals', 'teams', 'submissions', 'auditLogs'].includes(key);

    if (isLargeCollection) {
      // Use IndexedDB for large collections -- no size limit
      this.dataStorage.set(key, data).catch(() => {});
      // Also write to localStorage as fallback (may fail silently for large data)
      try { localStorage.setItem(key, json); } catch { /* quota exceeded, IndexedDB has it */ }
    } else {
      // Small data -- localStorage is fine
      if (typeof window !== 'undefined' && window.localStorage) {
        try { localStorage.setItem(key, json); } catch { /* ignore */ }
      }
    }
  }

  // ── Tester Controls ──────────────────────────────────────────
  
  clearAllData(): void {
    this.championshipStories = [];
    this.hallOfFameEntries = [];
    this.leaderboardData = [];
    this.talentDiscovery = [];
    this.platformStats = {
      regions: 0,
      mentors: 0,
      schools: 0,
      students: 0,
      projects: 0,
      grants: 0
    };
    this.heroSlides = [];
    this.newsFeedItems = [];
    this.countdownDate = '';
    this.users = [];
    this.pendingApprovals = [];
    this.rejectedApprovals = [];
    this.approvedApprovals = [];
    this.teams = [];
    this.submissions = [];
    this.auditLogs = [];
    this.csrUpdates = [];
    this.competitions = [];
    this.philosophyCards = [];

    // Clear all storage keys
    const keys = ['championshipStories', 'hallOfFameEntries', 'leaderboardData', 'talentDiscovery', 'platformStats', 'heroSlides', 'newsFeedItems', 'countdownDate', 'users', 'pendingApprovals', 'rejectedApprovals', 'approvedApprovals', 'teams', 'submissions', 'auditLogs', 'csrUpdates', 'competitions', 'philosophyCards'];
    keys.forEach(k => {
      if (typeof window !== 'undefined' && window.localStorage) {
        try { localStorage.removeItem(k); } catch { /* ignore */ }
      }
      this.dataStorage.remove(k).catch(() => {});
    });
  }

  loadSampleData(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      const contentKeys = [
        'championshipStories','hallOfFameEntries','leaderboardData','talentDiscovery',
        'platformStats','heroSlides','newsFeedItems','countdownDate',
        'users','pendingApprovals','rejectedApprovals','approvedApprovals',
        'teams','submissions','auditLogs','csrUpdates','competitions',
        'philosophyCards'
      ];
      contentKeys.forEach(k => localStorage.removeItem(k));
    }
    this.loadStateAndFallback();
      this.loadFromBackend();
  }

  // ── CRUD Championship Stories ─────────────────────────────────────
  
  addStory(story: Omit<ChampionshipStory, 'id'>): void {
    const id = 'story-' + Date.now();
    this.championshipStories.unshift({ id, ...story });
    this.saveState('championshipStories', this.championshipStories);
    this.apiService.createStory({ title: story.title, excerpt: story.body || '', date: story.date || new Date().toISOString(), image: story.image || '' }).subscribe();
  }

  removeStory(id: string): void {
    this.championshipStories = this.championshipStories.filter(s => s.id !== id);
    this.saveState('championshipStories', this.championshipStories);
    this.apiService.deleteStory(id).subscribe();
  }

  updateStory(story: ChampionshipStory): void {
    const idx = this.championshipStories.findIndex(s => s.id === story.id);
    if (idx !== -1) {
      this.championshipStories[idx] = { ...story };
      this.championshipStories = [...this.championshipStories];
      this.saveState('championshipStories', this.championshipStories);
    }
    this.apiService.updateStory(story.id, { title: story.title, excerpt: story.body || '', date: story.date || new Date().toISOString(), image: story.image || '' }).subscribe();
  }

  toggleLikeStory(storyId: string, userEmail: string): void {
    const idx = this.championshipStories.findIndex(s => s.id === storyId);
    if (idx === -1) return;
    const story = { ...this.championshipStories[idx] };
    const liked = story.likedBy ? [...story.likedBy] : [];
    const email = userEmail.trim().toLowerCase();
    
    if (liked.includes(email)) {
      // Unlike: remove user and decrement
      story.likedBy = liked.filter(e => e !== email);
      story.likes = Math.max(0, (story.likes || 1) - 1);
    } else {
      // Like: add user and increment
      story.likedBy = [...liked, email];
      story.likes = (story.likes || 0) + 1;
    }
    
    const updated = [...this.championshipStories];
    updated[idx] = story;
    this.championshipStories = updated;
    this.saveState('championshipStories', this.championshipStories);
  }

  // ── CRUD Hall of Fame ─────────────────────────────────────────────
  
  get activeHallOfFameEntries(): HallOfFameEntry[] {
    const today = new Date().toISOString().split('T')[0];
    return this.hallOfFameEntries.filter(entry => !entry.expiryDate || entry.expiryDate >= today);
  }

  addHofEntry(entry: Omit<HallOfFameEntry, 'id'>): void {
    const id = 'hof-' + Date.now();
    this.hallOfFameEntries.unshift({ id, ...entry });
    this.saveState('hallOfFameEntries', this.hallOfFameEntries);
    this.syncToBackend('hof', this.hallOfFameEntries.map(e => ({
      id: e.id, type: e.type || 'individual', initials: e.initials || '',
      name: e.name, team_name: e.teamName, project_title: e.projectTitle,
      members: e.members || [], school: e.school, year: e.year,
      badge: e.badge, track_class: e.trackClass, expiry_date: e.expiryDate
    })));
  }

  removeHofEntry(id: string): void {
    this.hallOfFameEntries = this.hallOfFameEntries.filter(e => e.id !== id);
    this.saveState('hallOfFameEntries', this.hallOfFameEntries);
    this.syncToBackend('hof', this.hallOfFameEntries.map(e => ({
      id: e.id, type: e.type || 'individual', initials: e.initials || '',
      name: e.name, team_name: e.teamName, project_title: e.projectTitle,
      members: e.members || [], school: e.school, year: e.year,
      badge: e.badge, track_class: e.trackClass, expiry_date: e.expiryDate
    })));
  }

  updateHofEntry(entry: HallOfFameEntry): void {
    const idx = this.hallOfFameEntries.findIndex(e => e.id === entry.id);
    if (idx !== -1) {
      this.hallOfFameEntries[idx] = { ...entry };
      this.hallOfFameEntries = [...this.hallOfFameEntries];
      this.saveState('hallOfFameEntries', this.hallOfFameEntries);
      this.syncToBackend('hof', this.hallOfFameEntries.map(e => ({
        id: e.id, type: e.type || 'individual', initials: e.initials || '',
        name: e.name, team_name: e.teamName, project_title: e.projectTitle,
        members: e.members || [], school: e.school, year: e.year,
        badge: e.badge, track_class: e.trackClass, expiry_date: e.expiryDate
      })));
    }
  }

  // ── CRUD Upcoming Events ───────────────────────────────────────────

  addEvent(event: Omit<UpcomingEvent, 'id'>): void {
    const id = 'evt-' + Date.now();
    this.upcomingEvents.push({ id, ...event });
    this.upcomingEvents = [...this.upcomingEvents];
    this.saveState('upcomingEvents', this.upcomingEvents);
    this.apiService.createEvent({ title: event.title, date: `${event.month || ''} ${event.day || ''}`, time: '', location: event.location || '', description: event.description || '' }).subscribe();
  }

  removeEvent(id: string): void {
    this.upcomingEvents = this.upcomingEvents.filter(e => e.id !== id);
    this.saveState('upcomingEvents', this.upcomingEvents);
    this.apiService.deleteEvent(id).subscribe();
  }

  updateEvent(event: UpcomingEvent): void {
    const idx = this.upcomingEvents.findIndex(e => e.id === event.id);
    if (idx !== -1) {
      this.upcomingEvents[idx] = { ...event };
      this.upcomingEvents = [...this.upcomingEvents];
      this.saveState('upcomingEvents', this.upcomingEvents);
    }
    this.apiService.updateEvent(event.id, { title: event.title, date: `${event.month || ''} ${event.day || ''}`, time: '', location: event.location || '', description: event.description || '' }).subscribe();
  }

  // ── CRUD Leaderboard ──────────────────────────────────────────────
  
  addLeaderboardEntry(entry: Omit<LeaderboardEntry, 'id'>): void {
    const id = 'lb-' + Date.now();
    this.leaderboardData.push({ id, ...entry });
    this.recalcLeaderboardRanks();
    this.saveState('leaderboardData', this.leaderboardData);
    this.apiService.createSchool({ name: entry.schoolName, region: entry.region || '', score: entry.points, rank: parseInt(entry.rank) || 0 }).subscribe();
  }

  updateLeaderboardEntry(id: string, updates: Partial<LeaderboardEntry>): void {
    const idx = this.leaderboardData.findIndex(e => e.id === id);
    if (idx !== -1) {
      this.leaderboardData[idx] = { ...this.leaderboardData[idx], ...updates };
      this.recalcLeaderboardRanks();
      this.saveState('leaderboardData', this.leaderboardData);
    }
    const entry = this.leaderboardData.find(e => e.id === id);
    if (entry) {
      this.apiService.updateSchool(id, { name: entry.schoolName, region: entry.region || '', score: entry.points, rank: parseInt(entry.rank) || 0 }).subscribe();
    }
  }

  removeLeaderboardEntry(id: string): void {
    this.leaderboardData = this.leaderboardData.filter(e => e.id !== id);
    this.recalcLeaderboardRanks();
    this.saveState('leaderboardData', this.leaderboardData);
    this.apiService.deleteSchool(id).subscribe();
  }

  private recalcLeaderboardRanks(): void {
    const sorted = [...this.leaderboardData].sort((a, b) => b.points - a.points);
    sorted.forEach((e, i) => {
      const r = i + 1;
      e.rank = r < 10 ? '0' + r : '' + r;
      e.points = e.trackPoints.all;
    });
    this.leaderboardData = sorted;
  }

  // ── CRUD News Feed ────────────────────────────────────────────────
  
  addNewsItem(item: Omit<NewsFeedItem, 'id'>): void {
    const id = 'news-' + Date.now();
    this.newsFeedItems.unshift({ id, ...item });
    this.saveState('newsFeedItems', this.newsFeedItems);
    this.syncToBackend('news', this.newsFeedItems.map(n => ({
      id: n.id, headline: n.headline, tag: n.tag, date: n.date, link: n.link
    })));
  }

  removeNewsItem(id: string): void {
    this.newsFeedItems = this.newsFeedItems.filter(n => n.id !== id);
    this.saveState('newsFeedItems', this.newsFeedItems);
    this.syncToBackend('news', this.newsFeedItems.map(n => ({
      id: n.id, headline: n.headline, tag: n.tag, date: n.date, link: n.link
    })));
  }

  updateNewsItem(item: NewsFeedItem): void {
    const idx = this.newsFeedItems.findIndex(n => n.id === item.id);
    if (idx !== -1) {
      this.newsFeedItems[idx] = { ...item };
      this.newsFeedItems = [...this.newsFeedItems];
      this.saveState('newsFeedItems', this.newsFeedItems);
      this.syncToBackend('news', this.newsFeedItems.map(n => ({
        id: n.id, headline: n.headline, tag: n.tag, date: n.date, link: n.link
      })));
    }
  }

  updatePlatformStats(stats: PlatformStats): void {
    this.platformStats = { ...stats };
    this.saveState('platformStats', this.platformStats);
    this.apiService.updatePlatformStats({ countdown_date: this.countdownDate, regions: stats.regions, schools: stats.schools, students: stats.students }).subscribe();
  }

  recalculatePlatformStats(): void {
    const schoolNames = new Set<string>();
    const regions = new Set<string>();
    let studentCount = 0;

    for (const u of this.users) {
      if (u.role === 'student') studentCount++;
      if (u.organization && !u.organization.startsWith('Independent')) {
        schoolNames.add(u.organization);
      }
    }

    for (const a of [...this.approvedApprovals, ...this.pendingApprovals]) {
      if (a.type === 'School Registration') {
        schoolNames.add(a.entity);
        if (a.details?.region) regions.add(a.details.region);
        if (a.details?.district) regions.add(a.details.district);
        if (a.details?.studentCount) studentCount += a.details.studentCount;
      }
    }

    const mentorCount = this.users.filter(u => u.role === 'instructor').length;

    this.platformStats = {
      regions: regions.size || 16,
      mentors: mentorCount || this.platformStats.mentors,
      schools: schoolNames.size || this.platformStats.schools,
      students: studentCount || this.platformStats.students,
      projects: this.platformStats.projects,
      grants: this.platformStats.grants
    };
    this.saveState('platformStats', this.platformStats);
  }

  updateCountdownDate(dateStr: string): void {
    this.countdownDate = dateStr;
    this.saveState('countdownDate', this.countdownDate);
    this.apiService.updatePlatformStats({ countdown_date: dateStr }).subscribe();
  }

  // ── User Management Helpers ─────────────────────────────────────
  
  private deduplicateUsers(loadedUsers: User[]): User[] {
    const uniqueUsers: User[] = [];
    const seenEmails = new Set<string>();
    for (const u of loadedUsers) {
      const e = u.email?.trim().toLowerCase();
      if (e && seenEmails.has(e)) {
        console.warn('[ContentService] Filtered duplicate user account with email:', e);
        continue;
      }
      if (e) seenEmails.add(e);
      uniqueUsers.push(u);
    }
    return uniqueUsers;
  }

  saveUsers(usersList: User[]): void {
    this.users = usersList;
    // Strip passwords and OTPs before persisting to browser storage
    const safe = usersList.map(({ password, otp, ...rest }: any) => ({ ...rest }));
    this.saveState('users', safe);
    this.syncToBackend('users', usersList.map(u => ({
      id: u.id, email: u.email, fullName: u.fullName, role: u.role,
      ticket: u.ticket, status: u.status, phone: u.phone || ''
    })));
  }

  isGroupLeadUser(u: any): boolean {
    return !!u && (u.registrationMode === 'group' || (!!u.ticket && String(u.ticket).startsWith('NTIC-GRP-')));
  }

  // ── Validation Helpers ───────────────────────────────────────────

  isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  isEmailTaken(email: string, excludeId?: string): boolean {
    const e = email.trim().toLowerCase();
    if (!e) return false;
    if (this.users.some(u => u.id !== excludeId && u.email?.trim().toLowerCase() === e)) return true;
    if (this.pendingApprovals.some(a => a.id !== excludeId && (a.contact?.trim().toLowerCase() === e || a.details?.email?.trim().toLowerCase() === e || a.details?.repEmail?.trim().toLowerCase() === e))) return true;
    return false;
  }

  isValidGhanaPhone(phone: string): boolean {
    const cleaned = phone.replace(/[\s\-().]/g, '');
    // MTN: 024, 025, 053, 054, 055, 059
    // Telecel (Vodafone): 020, 050
    // AirtelTigo: 026, 027, 056, 057
    // Landlines: 030 - 039 (Accra, Kumasi, Takoradi, Cape Coast, Koforidua, Sunyani, Ho, Tamale, Bolgatanga, Wa)
    const pattern = /^(?:\+233|233|0)(2[04567]|5[0345679]|3[0-9])[0-9]{7}$/;
    return pattern.test(cleaned);
  }

  getTelecomOperator(phone: string): 'MTN' | 'Telecel' | 'AirtelTigo' | 'Landline' | 'Unknown' {
    const cleaned = phone.replace(/[\s\-().]/g, '');
    const match = cleaned.match(/^(?:\+233|233|0)(\d{2})/);
    if (!match) return 'Unknown';
    const code = match[1];
    if (['24', '25', '53', '54', '55', '59'].includes(code)) return 'MTN';
    if (['20', '50'].includes(code)) return 'Telecel';
    if (['26', '27', '56', '57'].includes(code)) return 'AirtelTigo';
    if (code.startsWith('3')) return 'Landline';
    return 'Unknown';
  }

  isPhoneTaken(phone: string, excludeId?: string): boolean {
    const p = phone.replace(/[\s\-().]/g, '');
    if (!p) return false;
    const matches = (val: string | undefined) => {
      if (!val) return false;
      const v = val.replace(/[\s\-().]/g, '');
      return v === p || v.endsWith(p) || p.endsWith(v);
    };
    if (this.users.some(u => u.id !== excludeId && matches(u.phone))) return true;
    if (this.pendingApprovals.some(a => a.id !== excludeId && (matches(a.contact) || matches(a.details?.phone) || matches(a.details?.repTel)))) return true;
    return false;
  }

  // ── Approval Management Helpers ──────────────────────────────────
  
  saveApprovals(approvalsList: ApprovalRequest[]): void {
    this.pendingApprovals = approvalsList;
    this.saveState('pendingApprovals', this.pendingApprovals);
    this.syncToBackend('approvals', approvalsList.map(a => ({
      id: a.id, type: a.type, entity: a.entity, contact: a.contact,
      submitted: a.submitted, details: a.details || {},
      status: 'pending'
    })));
  }

  saveRejectedApprovals(list: ApprovalRequest[]): void {
    this.rejectedApprovals = list;
    this.saveState('rejectedApprovals', this.rejectedApprovals);
    this.syncToBackend('approvals', list.map(a => ({
      id: a.id, type: a.type, entity: a.entity, contact: a.contact,
      submitted: a.submitted, details: a.details || {},
      reviewed_at: a.reviewedAt, reviewer: a.reviewer,
      rejection_reasons: a.rejectionReasons, rejection_notes: a.rejectionNotes,
      status: 'rejected'
    })));
  }

  saveApprovedApprovals(list: ApprovalRequest[]): void {
    this.approvedApprovals = list;
    this.saveState('approvedApprovals', this.approvedApprovals);
    this.syncToBackend('approvals', list.map(a => ({
      id: a.id, type: a.type, entity: a.entity, contact: a.contact,
      submitted: a.submitted, details: a.details || {},
      reviewed_at: a.reviewedAt, reviewer: a.reviewer, status: 'approved'
    })));
  }

  saveHeroSlides(slidesList: HeroSlide[]): void {
    this.heroSlides = slidesList;
    this.saveState('heroSlides', this.heroSlides);
    slidesList.forEach(s => this.apiService.createHeroSlide({ id: s.id, title: s.title || '', subtitle: s.description || '', image_url: s.image || '', link: s.ctaLink || '' }).subscribe());
  }

  lookupApplication(query: string): ApplicationStatusResult {
    const q = query.trim().toLowerCase();
    if (!q) return { status: 'not_found' };

    const match = (r: ApprovalRequest) =>
      r.entity?.toLowerCase().includes(q) ||
      r.contact?.toLowerCase().includes(q) ||
      r.details?.email?.toLowerCase().includes(q) ||
      r.details?.repEmail?.toLowerCase().includes(q) ||
      r.details?.code?.toLowerCase().includes(q);

    const pending = this.pendingApprovals.find(match);
    if (pending) return { status: 'pending', application: pending };

    const approved = this.approvedApprovals.find(match);
    if (approved) return { status: 'approved', application: approved };

    const rejected = this.rejectedApprovals.find(match);
    if (rejected) return {
      status: 'rejected',
      application: rejected,
      rejectedDetails: {
        reasons: rejected.rejectionReasons || '',
        notes: rejected.rejectionNotes || '',
        reviewedAt: rejected.reviewedAt || ''
      }
    };

    return { status: 'not_found' };
  }

  // ── Team Management Helpers ──────────────────────────────────────
  
  saveTeams(teamsList: Team[]): void {
    const seen = new Set<string>();
    const deduped: Team[] = [];
    for (const t of teamsList) {
      const key = `${(t.name || '').trim()}::${(t.schoolName || '').trim()}::${(t.track || '').trim()}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(t);
      }
    }
    this.teams = deduped;
    this.saveState('teams', this.teams);
    deduped.forEach(t => this.apiService.createTeam({ name: t.name, track: t.track || '', school_name: t.schoolName || '', lead: t.lead || '', members: t.members || 1 }).subscribe());
  }

  syncNewTeamToBackend(team: Team): void {
    this.apiService.createTeam({
      name: team.name,
      track: team.track || 'Coding',
      lead: team.lead || 'Team Lead',
      members: team.members ?? 1,
      status: team.status || 'Active',
      school_name: team.schoolName || ''
    }).subscribe({
      next: (res: any) => {
        if (res && res.id) {
          this.teams = this.teams.map(t => (t.name === team.name && t.schoolName === team.schoolName && !t.id) ? { ...t, id: res.id } : t);
          this.saveState('teams', this.teams);
        }
      },
      error: (e: any) => console.log('Backend create team fallback to local cache')
    });
  }


  // ── Submission Management Helpers ────────────────────────────────
  
  saveSubmissions(submissionsList: Submission[]): void {
    this.submissions = submissionsList;
    this.saveState('submissions', this.submissions);
    this.syncToBackend('submissions', this.submissions.map(s => ({
      id: s.id, status: s.status, score: s.score, feedback: s.feedback || ''
    })));
  }

  syncGradeToBackend(submissionId: string, payload: { score?: number; feedback?: string; status?: string }): void {
    const local = this.submissions.find(s => s.id === submissionId);
    const backendId = (local && (local as any).backendId) || submissionId;
    this.apiService.gradeSubmission(backendId, payload).subscribe({
      next: (res: any) => console.log('Backend grade saved', res),
      error: (e: any) => console.log('Backend grade fallback to local cache')
    });
  }

  // ── Audit Log Helpers ────────────────────────────────────────────
  
  saveAuditLogs(auditLogsList: any[]): void {
    this.auditLogs = auditLogsList;
    this.saveState('auditLogs', this.auditLogs);
    if (auditLogsList.length > 0) {
      const top = auditLogsList[0];
      if (top && top.action) {
        this.apiService.createAuditLog({ action: top.action, usr: top.user || '', time: top.time || new Date().toISOString(), type: top.type || 'info' }).subscribe({ error: () => {} });
      }
    }
  }

  // ── CSR Updates Helpers ──────────────────────────────────────────
  
  saveCsrUpdates(csrUpdatesList: any[]): void {
    this.csrUpdates = csrUpdatesList;
    this.saveState('csrUpdates', this.csrUpdates);
    csrUpdatesList.forEach(c => this.apiService.createCsrUpdate({ id: c.id || '', title: c.title || '', description: c.description || '', date: c.date || '' }).subscribe());
  }

  // ── Talent Discovery Management Helpers ───────────────────────────
  
  addTalentDiscovery(item: Omit<TalentDiscovery, 'id'>): void {
    const id = 'td-' + Date.now();
    this.talentDiscovery.push({ id, ...item });
    this.saveState('talentDiscovery', this.talentDiscovery);
    this.apiService.createTalent({ id, ...item }).subscribe();
  }

  updateTalentDiscovery(id: string, updates: Partial<TalentDiscovery>): void {
    const idx = this.talentDiscovery.findIndex(i => i.id === id);
    if (idx !== -1) {
      this.talentDiscovery[idx] = { ...this.talentDiscovery[idx], ...updates };
      this.saveState('talentDiscovery', this.talentDiscovery);
    }
    this.apiService.updateTalent(id, updates).subscribe();
  }

  removeTalentDiscovery(id: string): void {
    this.talentDiscovery = this.talentDiscovery.filter(i => i.id !== id);
    this.saveState('talentDiscovery', this.talentDiscovery);
    this.apiService.deleteTalent(id).subscribe();
  }

  saveCompetitions(data: Competition[]): void {
    this.competitions = data;
    this.saveState('competitions', data);
  }

  addCompetition(comp: Omit<Competition, 'id'>): void {
    const id = `COMP-${Date.now()}`;
    const newComp = { id, ...comp, createdAt: new Date().toISOString() };
    this.competitions = [...this.competitions, newComp];
    this.saveCompetitions(this.competitions);

    this.apiService.createCompetition({
      title: comp.title,
      description: comp.description || '',
      track: comp.track || 'Coding',
      category: comp.category || '',
      deadline: comp.deadline || '',
      status: comp.status || 'active',
      comp_type: (comp as any).type || 'qualifier',
      max_teams: (comp as any).maxTeams || 50,
      teams: comp.teams || 0,
      prize: comp.prize || '',
      start_date: (comp as any).startDate || '',
      end_date: (comp as any).endDate || '',
      phases: JSON.stringify(comp.phases || []),
      rules: (comp as any).rules || '',
      criteria: (comp as any).criteria || '',
      progress: comp.progress || 0
    }).subscribe({
      next: (res: any) => {
        if (res && res.id) {
          this.competitions = this.competitions.map(c => c.id === id ? { ...c, id: res.id } : c);
          this.saveCompetitions(this.competitions);
        }
      },
      error: (e: any) => console.log('Backend create competition fallback to local cache')
    });

    // Log audit log
    const auditLogsList = [
      {
        id: `LOG-${Date.now()}`,
        action: `Created Competition: ${comp.title}`,
        user: getAuthValue('activeUserEmail') || 'System',
        time: new Date().toISOString(),
        category: 'approval'
      },
      ...this.auditLogs
    ];
    this.saveAuditLogs(auditLogsList);
  }

  updateCompetition(comp: Competition): void {
    const idx = this.competitions.findIndex(c => c.id === comp.id);
    if (idx > -1) {
      this.competitions[idx] = comp;
      this.saveCompetitions(this.competitions);

      this.apiService.updateCompetition(comp.id, {
        title: comp.title,
        description: comp.description || '',
        track: comp.track || 'Coding',
        category: comp.category || '',
        deadline: comp.deadline || '',
        status: comp.status || 'active',
        comp_type: (comp as any).type || 'qualifier',
        max_teams: (comp as any).maxTeams || 50,
        teams: comp.teams || 0,
        prize: comp.prize || '',
        start_date: (comp as any).startDate || '',
        end_date: (comp as any).endDate || '',
        phases: JSON.stringify(comp.phases || []),
        rules: (comp as any).rules || '',
        criteria: (comp as any).criteria || '',
        progress: comp.progress || 0
      }).subscribe({
        next: (res: any) => console.log('Backend competition updated', res),
        error: (e: any) => console.log('Backend update competition fallback to local cache')
      });

      const auditLogsList = [
        {
          id: `LOG-${Date.now()}`,
          action: `Updated Competition: ${comp.title} (status: ${comp.status})`,
          user: getAuthValue('activeUserEmail') || 'System',
          time: new Date().toISOString(),
          category: 'approval'
        },
        ...this.auditLogs
      ];
      this.saveAuditLogs(auditLogsList);
    }
  }

  removeCompetition(id: string): void {
    const found = this.competitions.find(c => c.id === id);
    this.competitions = this.competitions.filter(c => c.id !== id);
    this.saveCompetitions(this.competitions);

    this.apiService.deleteCompetition(id).subscribe({
      next: (res: any) => console.log('Backend competition deleted', res),
      error: (e: any) => console.log('Backend delete competition fallback to local cache')
    });

    if (found) {
      const auditLogsList = [
        {
          id: `LOG-${Date.now()}`,
          action: `Removed Competition: ${found.title}`,
          user: getAuthValue('activeUserEmail') || 'System',
          time: new Date().toISOString(),
          category: 'revoked'
        },
        ...this.auditLogs
      ];
      this.saveAuditLogs(auditLogsList);
    }
  }

  savePhilosophyCards(list: PhilosophyCard[]): void {
    this.philosophyCards = [...list];
    this.saveState('philosophyCards', this.philosophyCards);
    list.forEach(c => this.apiService.createPhilosophy({ title: c.title, description: c.description || '', image: c.image || '' }).subscribe());
  }

  savePhilosophyCard(card: PhilosophyCard): void {
    const idx = this.philosophyCards.findIndex(c => c.id === card.id);
    if (idx >= 0) {
      this.philosophyCards[idx] = { ...card };
    } else {
      this.philosophyCards.push({ ...card });
    }
    this.saveState('philosophyCards', this.philosophyCards);
  }

  // ── LMS Management ──────────────────────────────────────────

  saveLmsCourses(list: LmsCourse[]): void {
    this.lmsCourses = list;
    this.saveState('lmsCourses', this.lmsCourses);
    this.syncToBackend('lms_courses', this.lmsCourses.map(c => ({
      id: c.id, title: c.title, track: c.track, icon: c.icon, level: c.level,
      description: c.description, modules: c.modules, enrolled: c.enrolled,
      completion: c.completion, status: c.status, created_at: c.createdAt,
      submitted_by: c.submittedBy, approval_status: c.approvalStatus,
      rejection_reason: c.rejectionReason
    })));
  }

  saveLmsCourse(course: LmsCourse): void {
    const idx = this.lmsCourses.findIndex(c => c.id === course.id);
    if (idx >= 0) {
      this.lmsCourses[idx] = { ...course };
    } else {
      this.lmsCourses.push({ ...course });
    }
    this.saveLmsCourses(this.lmsCourses);
  }

  removeLmsCourse(id: string): void {
    this.lmsCourses = this.lmsCourses.filter(c => c.id !== id);
    this.lmsModules = this.lmsModules.filter(m => m.courseId !== id);
    this.lmsMaterials = this.lmsMaterials.filter(m => m.courseId !== id);
    this.lmsAssignments = this.lmsAssignments.filter(a => a.courseId !== id);
    this.saveLmsCourses(this.lmsCourses);
    this.saveLmsModules(this.lmsModules);
    this.saveLmsMaterials(this.lmsMaterials);
    this.saveLmsAssignments(this.lmsAssignments);
  }

  saveLmsModules(list: LmsModule[]): void {
    this.lmsModules = list;
    this.saveState('lmsModules', this.lmsModules);
    this.syncToBackend('lms_modules', this.lmsModules.map(m => ({
      id: m.id, courseId: m.courseId, title: m.title, description: m.description,
      order: m.order, icon: m.icon, status: m.status,
      submitted_by: m.submittedBy, approval_status: m.approvalStatus
    })));
  }

  saveLmsModule(mod: LmsModule): void {
    const idx = this.lmsModules.findIndex(m => m.id === mod.id);
    if (idx >= 0) {
      this.lmsModules[idx] = { ...mod };
    } else {
      this.lmsModules.push({ ...mod });
    }
    this.saveLmsModules(this.lmsModules);
  }

  removeLmsModule(id: string): void {
    this.lmsModules = this.lmsModules.filter(m => m.id !== id);
    this.lmsMaterials = this.lmsMaterials.filter(m => m.moduleId !== id);
    this.saveLmsModules(this.lmsModules);
    this.saveLmsMaterials(this.lmsMaterials);
  }

  saveLmsMaterials(list: LmsMaterial[]): void {
    this.lmsMaterials = list;
    this.saveState('lmsMaterials', this.lmsMaterials);
    this.syncToBackend('lms_materials', this.lmsMaterials.map(m => ({
      id: m.id, courseId: m.courseId, moduleId: m.moduleId, title: m.title,
      type: m.type, url: m.url, description: m.description, created_at: m.createdAt,
      submitted_by: m.submittedBy, approval_status: m.approvalStatus
    })));
  }

  saveLmsMaterial(mat: LmsMaterial): void {
    const idx = this.lmsMaterials.findIndex(m => m.id === mat.id);
    if (idx >= 0) {
      this.lmsMaterials[idx] = { ...mat };
    } else {
      this.lmsMaterials.push({ ...mat });
    }
    this.saveLmsMaterials(this.lmsMaterials);
  }

  removeLmsMaterial(id: string): void {
    this.lmsMaterials = this.lmsMaterials.filter(m => m.id !== id);
    this.saveLmsMaterials(this.lmsMaterials);
  }

  saveLmsAssignments(list: LmsAssignment[]): void {
    this.lmsAssignments = list; 
    this.saveState('lmsAssignments', this.lmsAssignments);
    this.syncToBackend('lms_assignments', this.lmsAssignments.map(a => ({
      id: a.id, courseId: a.courseId, title: a.title, description: a.description,
      due_date: a.dueDate, maxScore: a.maxScore, track: a.track, status: a.status,
      created_at: a.createdAt, submitted_by: a.submittedBy,
      approval_status: a.approvalStatus
    })));
  }

  saveLmsAssignment(asgn: LmsAssignment): void {
    const idx = this.lmsAssignments.findIndex(a => a.id === asgn.id);
    if (idx >= 0) {
      this.lmsAssignments[idx] = { ...asgn };
    } else {
      this.lmsAssignments.push({ ...asgn });
    }
    this.saveLmsAssignments(this.lmsAssignments);
  }

  removeLmsAssignment(id: string): void {
    this.lmsAssignments = this.lmsAssignments.filter(a => a.id !== id);
    this.saveLmsAssignments(this.lmsAssignments);
  }

  gradeLmsSubmission(id: string, score: number, feedback: string): void {
    const sub = this.lmsSubmissions.find(s => s.id === id);
    if (sub) {
      sub.score = score;
      sub.feedback = feedback;
      sub.status = 'graded';
      this.saveLmsSubmissions(this.lmsSubmissions);
    }
  }

  requestSubmissionRevision(id: string, adminNotes: string): void {
    const sub = this.lmsSubmissions.find(s => s.id === id);
    if (sub) {
      sub.status = 'regrade_requested';
      sub.feedback = (sub.feedback ? sub.feedback + '\n\n' : '') + `[Admin Note -- Instructor Revision Requested]: ${adminNotes}`;
      this.saveLmsSubmissions(this.lmsSubmissions);
    }
  }

  rejectLmsSubmission(id: string, adminNotes: string): void {
    const sub = this.lmsSubmissions.find(s => s.id === id);
    if (sub) {
      sub.status = 'rejected';
      sub.score = undefined;
      sub.feedback = (sub.feedback ? sub.feedback + '\n\n' : '') + `[Admin Note -- Rejected, Resubmit Required]: ${adminNotes}`;
      this.saveLmsSubmissions(this.lmsSubmissions);
    }
  }


  saveLmsSubmissions(list: LmsSubmission[]): void {
    this.lmsSubmissions = list;
    this.saveState('lmsSubmissions', this.lmsSubmissions);
    this.syncToBackend('lms_submissions', this.lmsSubmissions.map(s => ({
      id: s.id, assignmentId: s.assignmentId, courseId: s.courseId,
      studentId: s.studentId, studentName: s.studentName, studentEmail: s.studentEmail,
      submitted_at: s.submittedAt, content: s.content, url: s.url,
      score: s.score, status: s.status, feedback: s.feedback
    })));
  }

  saveLmsEnrollments(list: LmsEnrollment[]): void {
    this.lmsEnrollments = list;
    this.saveState('lmsEnrollments', this.lmsEnrollments);
    this.syncToBackend('lms_enrollments', this.lmsEnrollments.map(e => ({
      id: e.id, courseId: e.courseId, studentId: e.studentId,
      studentName: e.studentName, studentEmail: e.studentEmail,
      progressPct: e.progressPct, enrolled_at: e.enrolledAt,
      lastActive: e.lastActive, status: e.status
    })));
  }

  // ── LMS Moderation & Approvals ──────────────────────────────
  approveLmsItem(type: 'course' | 'module' | 'material' | 'assignment', id: string, adminEmail: string = 'admin@ntic.org.gh'): void {
    const timestamp = new Date().toISOString().split('T')[0];
    if (type === 'course') {
      const item = this.lmsCourses.find(c => c.id === id);
      if (item) { item.approvalStatus = 'approved'; item.reviewedBy = adminEmail; item.reviewedAt = timestamp; this.saveState('lmsCourses', this.lmsCourses); this.syncToBackend('lms_courses', this.lmsCourses.map(c => ({
        id: c.id, title: c.title, track: c.track, icon: c.icon, level: c.level,
        description: c.description, modules: c.modules, enrolled: c.enrolled,
        completion: c.completion, status: c.status, created_at: c.createdAt,
        submitted_by: c.submittedBy, approval_status: c.approvalStatus,
        rejection_reason: c.rejectionReason
      }))); }
    } else if (type === 'module') {
      const item = this.lmsModules.find(m => m.id === id);
      if (item) { item.approvalStatus = 'approved'; item.reviewedBy = adminEmail; item.reviewedAt = timestamp; this.saveState('lmsModules', this.lmsModules); this.syncToBackend('lms_modules', this.lmsModules.map(m => ({
        id: m.id, courseId: m.courseId, title: m.title, description: m.description,
        order: m.order, icon: m.icon, status: m.status,
        submitted_by: m.submittedBy, approval_status: m.approvalStatus
      }))); }
    } else if (type === 'material') {
      const item = this.lmsMaterials.find(m => m.id === id);
      if (item) { item.approvalStatus = 'approved'; item.reviewedBy = adminEmail; item.reviewedAt = timestamp; this.saveState('lmsMaterials', this.lmsMaterials); this.syncToBackend('lms_materials', this.lmsMaterials.map(m => ({
        id: m.id, courseId: m.courseId, moduleId: m.moduleId, title: m.title,
        type: m.type, url: m.url, description: m.description, created_at: m.createdAt,
        submitted_by: m.submittedBy, approval_status: m.approvalStatus
      }))); }
    } else if (type === 'assignment') {
      const item = this.lmsAssignments.find(a => a.id === id);
      if (item) { item.approvalStatus = 'approved'; item.reviewedBy = adminEmail; item.reviewedAt = timestamp; this.saveState('lmsAssignments', this.lmsAssignments); this.syncToBackend('lms_assignments', this.lmsAssignments.map(a => ({
        id: a.id, courseId: a.courseId, title: a.title, description: a.description,
        due_date: a.dueDate, maxScore: a.maxScore, track: a.track, status: a.status,
        created_at: a.createdAt, submitted_by: a.submittedBy,
        approval_status: a.approvalStatus
      }))); }
    }
  }

  rejectLmsItem(type: 'course' | 'module' | 'material' | 'assignment', id: string, reason: string, adminEmail: string = 'admin@ntic.org.gh'): void {
    const timestamp = new Date().toISOString().split('T')[0];
    if (type === 'course') {
      const item = this.lmsCourses.find(c => c.id === id);
      if (item) { item.approvalStatus = 'rejected'; item.rejectionReason = reason; item.reviewedBy = adminEmail; item.reviewedAt = timestamp; this.saveState('lmsCourses', this.lmsCourses); this.syncToBackend('lms_courses', this.lmsCourses.map(c => ({
        id: c.id, title: c.title, track: c.track, icon: c.icon, level: c.level,
        description: c.description, modules: c.modules, enrolled: c.enrolled,
        completion: c.completion, status: c.status, created_at: c.createdAt,
        submitted_by: c.submittedBy, approval_status: c.approvalStatus,
        rejection_reason: c.rejectionReason
      }))); }
    } else if (type === 'module') {
      const item = this.lmsModules.find(m => m.id === id);
      if (item) { item.approvalStatus = 'rejected'; item.rejectionReason = reason; item.reviewedBy = adminEmail; item.reviewedAt = timestamp; this.saveState('lmsModules', this.lmsModules); this.syncToBackend('lms_modules', this.lmsModules.map(m => ({
        id: m.id, courseId: m.courseId, title: m.title, description: m.description,
        order: m.order, icon: m.icon, status: m.status,
        submitted_by: m.submittedBy, approval_status: m.approvalStatus
      }))); }
    } else if (type === 'material') {
      const item = this.lmsMaterials.find(m => m.id === id);
      if (item) { item.approvalStatus = 'rejected'; item.rejectionReason = reason; item.reviewedBy = adminEmail; item.reviewedAt = timestamp; this.saveState('lmsMaterials', this.lmsMaterials); this.syncToBackend('lms_materials', this.lmsMaterials.map(m => ({
        id: m.id, courseId: m.courseId, moduleId: m.moduleId, title: m.title,
        type: m.type, url: m.url, description: m.description, created_at: m.createdAt,
        submitted_by: m.submittedBy, approval_status: m.approvalStatus
      }))); }
    } else if (type === 'assignment') {
      const item = this.lmsAssignments.find(a => a.id === id);
      if (item) { item.approvalStatus = 'rejected'; item.rejectionReason = reason; item.reviewedBy = adminEmail; item.reviewedAt = timestamp; this.saveState('lmsAssignments', this.lmsAssignments); this.syncToBackend('lms_assignments', this.lmsAssignments.map(a => ({
        id: a.id, courseId: a.courseId, title: a.title, description: a.description,
        due_date: a.dueDate, maxScore: a.maxScore, track: a.track, status: a.status,
        created_at: a.createdAt, submitted_by: a.submittedBy,
        approval_status: a.approvalStatus
      }))); }
    }
  }
}
