import { Injectable } from '@angular/core';

export interface ChampionshipStory {
  id: string;
  tag: string;
  tagColor: string; // 'robotics' | 'coding' | 'cyber' | 'ai' | 'innovation' | ''
  image: string;
  date: string;
  readTime: string;
  title: string;
  body: string;
}

export interface HallOfFameEntry {
  id: string;
  initials: string;
  name: string;
  school: string;
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

export interface User {
  id: string;
  role: 'judge' | 'sponsor' | 'school_admin' | 'student' | 'instructor' | 'super_admin';
  fullName: string;
  email: string;
  phone: string;
  otp: string;
  organization: string;
  track?: string;     // for judges
  tier?: string;      // for sponsors
  ticket: string;     // E.g. NTIC-JDG-XXXX
  status: string;     // E.g. Active, Pending
  registeredAt: string;
  lastLogin: string;
}

export interface ApprovalRequest {
  id: string;
  type: 'School Registration' | 'Team Addition' | 'Instructor Access';
  entity: string;
  contact: string;
  submitted: string;
  details: {
    region?: string;
    phone?: string;
    code?: string;
    tracks?: string;
    docs?: string[];
    infra?: string;
    school?: string;
    track?: string;
    project?: string;
    members?: string[];
    coach?: string;
    institution?: string;
    credentials?: string;
    specialization?: string;
    experience?: string;
    courses?: string[];
    teamsList?: any[];
  };
}

export interface Team {
  id?: string;
  name: string;
  track: string;
  lead: string;
  members: number;
  status: string;
  schoolName?: string;
  mentor?: string;
  motto?: string;
  rosterList?: string[];
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
}

@Injectable({
  providedIn: 'root'
})
export class ContentService {

  // ── Championship Stories ─────────────────────────────────────
  championshipStories: ChampionshipStory[] = [];
  
  // ── Hall of Fame ─────────────────────────────────────────────
  hallOfFameEntries: HallOfFameEntry[] = [];

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
  pendingApprovals: ApprovalRequest[] = [];
  teams: Team[] = [];
  submissions: Submission[] = [];
  auditLogs: any[] = [];
  csrUpdates: any[] = [];
  competitions: Competition[] = [];

  // ── Initial Mock Data backups for restoration ──────────────────
  private readonly defaultCompetitions: Competition[] = [];
  private readonly defaultStories: ChampionshipStory[] = [];

  private readonly defaultHof: HallOfFameEntry[] = [];

  private readonly defaultLeaderboard: LeaderboardEntry[] = [];

  private readonly defaultTalentDiscovery: TalentDiscovery[] = [];

  private readonly defaultStats: PlatformStats = { regions: 0, mentors: 0, schools: 0, students: 0, projects: 0, grants: 0 };

  private readonly defaultHero: HeroSlide[] = [];

  private readonly defaultNews: NewsFeedItem[] = [];

  private readonly defaultUsers: User[] = [
    {
      id: 'USR-000',
      role: 'super_admin',
      fullName: 'Admin',
      email: 'admin@ntic.org.gh',
      phone: '+233 20 000 0000',
      otp: 'admin123',
      organization: 'NTIC',
      ticket: 'NTIC-ADM-0000',
      status: 'Active',
      registeredAt: 'Jan 1, 2026',
      lastLogin: 'Just now'
    }
  ];

  private readonly defaultPendingApprovals: ApprovalRequest[] = [];

  private readonly defaultTeams: Team[] = [];

  private readonly defaultSubmissions: Submission[] = [];

  private readonly defaultAuditLogs = [];

  private readonly defaultCsrUpdates = [];

  constructor() {
    this.loadStateAndFallback();
  }

  private loadStateAndFallback(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      // Basic ContentService data
      this.championshipStories = this.loadKey('championshipStories', this.defaultStories);
      this.hallOfFameEntries = this.loadKey('hallOfFameEntries', this.defaultHof);
      this.leaderboardData = this.loadKey('leaderboardData', this.defaultLeaderboard);
      this.talentDiscovery = this.loadKey('talentDiscovery', this.defaultTalentDiscovery);
      this.platformStats = this.loadKey('platformStats', this.defaultStats);
      this.heroSlides = this.loadKey('heroSlides', this.defaultHero);
      this.newsFeedItems = this.loadKey('newsFeedItems', this.defaultNews);
      
      const savedCountdown = localStorage.getItem('countdownDate');
      if (savedCountdown) {
        try {
          this.countdownDate = JSON.parse(savedCountdown);
        } catch {
          this.countdownDate = savedCountdown;
        }
      } else {
        this.countdownDate = '2026-08-15T09:00:00';
      }

      // Shared dynamic datasets
      this.users = this.loadKey('users', this.defaultUsers);
      this.pendingApprovals = this.loadKey('pendingApprovals', this.defaultPendingApprovals);
      this.teams = this.loadKey('teams', this.defaultTeams);
      this.submissions = this.loadKey('submissions', this.defaultSubmissions);
      this.auditLogs = this.loadKey('auditLogs', this.defaultAuditLogs);
      this.csrUpdates = this.loadKey('csrUpdates', this.defaultCsrUpdates);
      this.competitions = this.loadKey('competitions', this.defaultCompetitions);
    } else {
      // Fallback in case of SSR
      this.championshipStories = [...this.defaultStories];
      this.hallOfFameEntries = [...this.defaultHof];
      this.leaderboardData = [...this.defaultLeaderboard];
      this.talentDiscovery = [...this.defaultTalentDiscovery];
      this.platformStats = { ...this.defaultStats };
      this.heroSlides = [...this.defaultHero];
      this.newsFeedItems = [...this.defaultNews];
      this.users = [...this.defaultUsers];
      this.pendingApprovals = [...this.defaultPendingApprovals];
      this.teams = [...this.defaultTeams];
      this.submissions = [...this.defaultSubmissions];
      this.auditLogs = [...this.defaultAuditLogs];
      this.csrUpdates = [...this.defaultCsrUpdates];
      this.competitions = [...this.defaultCompetitions];
    }
  }

  private loadKey<T>(key: string, defaultValue: T): T {
    const item = localStorage.getItem(key);
    if (item) {
      try {
        return JSON.parse(item);
      } catch (e) {
        console.error('Failed to parse key: ' + key, e);
      }
    }
    // Save the default value back to storage for future sync
    this.saveState(key, defaultValue);
    return JSON.parse(JSON.stringify(defaultValue));
  }

  private saveState(key: string, data: any): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(key, JSON.stringify(data));
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
    this.teams = [];
    this.submissions = [];
    this.auditLogs = [];
    this.csrUpdates = [];

    // Clear all storage keys
    const keys = ['championshipStories', 'hallOfFameEntries', 'leaderboardData', 'talentDiscovery', 'platformStats', 'heroSlides', 'newsFeedItems', 'countdownDate', 'users', 'pendingApprovals', 'teams', 'submissions', 'auditLogs', 'csrUpdates'];
    keys.forEach(k => {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(k, JSON.stringify(this[k as keyof ContentService]));
      }
    });
  }

  loadSampleData(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.clear(); // Wipes previous edits
    }
    this.loadStateAndFallback();
  }

  // ── CRUD Championship Stories ─────────────────────────────────────
  
  addStory(story: Omit<ChampionshipStory, 'id'>): void {
    const id = 'story-' + Date.now();
    this.championshipStories.unshift({ id, ...story });
    this.saveState('championshipStories', this.championshipStories);
  }

  removeStory(id: string): void {
    this.championshipStories = this.championshipStories.filter(s => s.id !== id);
    this.saveState('championshipStories', this.championshipStories);
  }

  updateStory(story: ChampionshipStory): void {
    const idx = this.championshipStories.findIndex(s => s.id === story.id);
    if (idx !== -1) {
      this.championshipStories[idx] = { ...story };
      this.championshipStories = [...this.championshipStories];
      this.saveState('championshipStories', this.championshipStories);
    }
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
  }

  removeHofEntry(id: string): void {
    this.hallOfFameEntries = this.hallOfFameEntries.filter(e => e.id !== id);
    this.saveState('hallOfFameEntries', this.hallOfFameEntries);
  }

  updateHofEntry(entry: HallOfFameEntry): void {
    const idx = this.hallOfFameEntries.findIndex(e => e.id === entry.id);
    if (idx !== -1) {
      this.hallOfFameEntries[idx] = { ...entry };
      this.hallOfFameEntries = [...this.hallOfFameEntries];
      this.saveState('hallOfFameEntries', this.hallOfFameEntries);
    }
  }

  // ── CRUD Leaderboard ──────────────────────────────────────────────
  
  addLeaderboardEntry(entry: Omit<LeaderboardEntry, 'id'>): void {
    const id = 'lb-' + Date.now();
    this.leaderboardData.push({ id, ...entry });
    this.recalcLeaderboardRanks();
    this.saveState('leaderboardData', this.leaderboardData);
  }

  updateLeaderboardEntry(id: string, updates: Partial<LeaderboardEntry>): void {
    const idx = this.leaderboardData.findIndex(e => e.id === id);
    if (idx !== -1) {
      this.leaderboardData[idx] = { ...this.leaderboardData[idx], ...updates };
      this.recalcLeaderboardRanks();
      this.saveState('leaderboardData', this.leaderboardData);
    }
  }

  removeLeaderboardEntry(id: string): void {
    this.leaderboardData = this.leaderboardData.filter(e => e.id !== id);
    this.recalcLeaderboardRanks();
    this.saveState('leaderboardData', this.leaderboardData);
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
  }

  removeNewsItem(id: string): void {
    this.newsFeedItems = this.newsFeedItems.filter(n => n.id !== id);
    this.saveState('newsFeedItems', this.newsFeedItems);
  }

  updateNewsItem(item: NewsFeedItem): void {
    const idx = this.newsFeedItems.findIndex(n => n.id === item.id);
    if (idx !== -1) {
      this.newsFeedItems[idx] = { ...item };
      this.newsFeedItems = [...this.newsFeedItems];
      this.saveState('newsFeedItems', this.newsFeedItems);
    }
  }

  updatePlatformStats(stats: PlatformStats): void {
    this.platformStats = { ...stats };
    this.saveState('platformStats', this.platformStats);
  }

  updateCountdownDate(dateStr: string): void {
    this.countdownDate = dateStr;
    this.saveState('countdownDate', this.countdownDate);
  }

  // ── User Management Helpers ─────────────────────────────────────
  
  saveUsers(usersList: User[]): void {
    this.users = usersList;
    this.saveState('users', this.users);
  }

  // ── Approval Management Helpers ──────────────────────────────────
  
  saveApprovals(approvalsList: ApprovalRequest[]): void {
    this.pendingApprovals = approvalsList;
    this.saveState('pendingApprovals', this.pendingApprovals);
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
  }

  // ── Submission Management Helpers ────────────────────────────────
  
  saveSubmissions(submissionsList: Submission[]): void {
    this.submissions = submissionsList;
    this.saveState('submissions', this.submissions);
  }

  // ── Audit Log Helpers ────────────────────────────────────────────
  
  saveAuditLogs(auditLogsList: any[]): void {
    this.auditLogs = auditLogsList;
    this.saveState('auditLogs', this.auditLogs);
  }

  // ── CSR Updates Helpers ──────────────────────────────────────────
  
  saveCsrUpdates(csrUpdatesList: any[]): void {
    this.csrUpdates = csrUpdatesList;
    this.saveState('csrUpdates', this.csrUpdates);
  }

  // ── Talent Discovery Management Helpers ───────────────────────────
  
  addTalentDiscovery(item: Omit<TalentDiscovery, 'id'>): void {
    const id = 'td-' + Date.now();
    this.talentDiscovery.push({ id, ...item });
    this.saveState('talentDiscovery', this.talentDiscovery);
  }

  updateTalentDiscovery(id: string, updates: Partial<TalentDiscovery>): void {
    const idx = this.talentDiscovery.findIndex(i => i.id === id);
    if (idx !== -1) {
      this.talentDiscovery[idx] = { ...this.talentDiscovery[idx], ...updates };
      this.saveState('talentDiscovery', this.talentDiscovery);
    }
  }

  removeTalentDiscovery(id: string): void {
    this.talentDiscovery = this.talentDiscovery.filter(i => i.id !== id);
    this.saveState('talentDiscovery', this.talentDiscovery);
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
    
    // Log audit log
    const auditLogsList = [
      {
        id: `LOG-${Date.now()}`,
        action: `Created Competition: ${comp.title}`,
        user: localStorage.getItem('activeUserEmail') || 'System',
        time: 'Just now',
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

      const auditLogsList = [
        {
          id: `LOG-${Date.now()}`,
          action: `Updated Competition: ${comp.title} (status: ${comp.status})`,
          user: localStorage.getItem('activeUserEmail') || 'System',
          time: 'Just now',
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

    if (found) {
      const auditLogsList = [
        {
          id: `LOG-${Date.now()}`,
          action: `Removed Competition: ${found.title}`,
          user: localStorage.getItem('activeUserEmail') || 'System',
          time: 'Just now',
          category: 'revoked'
        },
        ...this.auditLogs
      ];
      this.saveAuditLogs(auditLogsList);
    }
  }
}
