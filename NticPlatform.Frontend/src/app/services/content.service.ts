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

export interface Competition {
  id: string;
  title: string;
  track: string;
  icon: string;
  category: string;
  teams: number;
  deadline: string;
  prize: string;
  status: 'active' | 'registration' | 'completed';
  progress: number;
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
  private readonly defaultStories: ChampionshipStory[] = [
    {
      id: 'story-1',
      tag: 'Robotics',
      tagColor: '',
      image: 'assets/ntic_image_1.jpeg',
      date: 'June 18, 2026',
      readTime: '6 min read',
      title: 'PRESEC Legon Squad Unveils Autonomous Cocoapod Harvester Bot',
      body: 'The defending champions showcased their latest robot designed to classify pod ripeness and pick them without human intervention, boosting harvest efficiency for cocoa farmers.'
    },
    {
      id: 'story-2',
      tag: 'Coding',
      tagColor: 'coding',
      image: 'assets/ntic_image_6.jpeg',
      date: 'June 14, 2026',
      readTime: '4 min read',
      title: 'Wesley Girls\' High School Triumphs in Algorithm Sprint',
      body: 'Using optimized memory strategies in Python, the squad cleared 8 advanced problems in record time to secure their place in the national semi-finals.'
    },
    {
      id: 'story-3',
      tag: 'Cybersecurity',
      tagColor: 'cyber',
      image: 'assets/ntic_image_11.jpeg',
      date: 'June 10, 2026',
      readTime: '5 min read',
      title: 'Cyber Security Heats: The Sandbox Capture The Flag',
      body: 'Teams from Prempeh College and Tamale SHS go head-to-head in a sandboxed CTF challenge to audit secure database links against mock intrusions.'
    },
    {
      id: 'story-4',
      tag: 'AI',
      tagColor: 'ai',
      image: 'assets/ntic_image_14.jpeg',
      date: 'June 8, 2026',
      readTime: '7 min read',
      title: 'Achimota School AI Team Builds Crop Disease Classifier',
      body: 'Using a fine-tuned ResNet-18 model, the team achieved 94% accuracy in detecting cocoa blight from phone photos — a tool that could revolutionize Ghanaian farming.'
    },
    {
      id: 'story-5',
      tag: 'Innovation',
      tagColor: 'innovation',
      image: 'assets/ntic_image_25.jpeg',
      date: 'June 5, 2026',
      readTime: '3 min read',
      title: 'Tamale SHS Wins National Open Innovation Prize',
      body: 'The team designed a solar-powered water purification system for rural communities in the Northern Region, impressing judges with both technical depth and social impact.'
    },
    {
      id: 'story-6',
      tag: 'Robotics',
      tagColor: '',
      image: 'assets/ntic_image_33.jpeg',
      date: 'June 2, 2026',
      readTime: '5 min read',
      title: 'Prempeh College Robotics Team Dominates IoT Challenge',
      body: 'Using Arduino sensors and custom firmware, the Prempeh team created a real-time logistics routing system that slashed simulated delivery times by 40%.'
    }
  ];

  private readonly defaultHof: HallOfFameEntry[] = [
    { id: 'hof-1', initials: 'KA', name: 'Kwame Asante',     school: 'PRESEC Legon',    year: '2024', badge: '🥇 Coding Champion',  trackClass: 'coding-track', expiryDate: '2026-12-31' },
    { id: 'hof-2', initials: 'EO', name: 'Efua Owusu',       school: 'Achimota School', year: '2024', badge: '🤖 Robotics MVP',    trackClass: 'robotics-track', expiryDate: '2027-06-30' },
    { id: 'hof-3', initials: 'PN', name: 'Prince Nkrumah',   school: 'Prempeh College', year: '2023', badge: '🔐 CTF Winner',       trackClass: 'cyber-track', expiryDate: '2025-12-31' },
    { id: 'hof-4', initials: 'AA', name: 'Abena Acheampong', school: "Wesley Girls'",   year: '2023', badge: '🧠 AI Track Gold',    trackClass: 'ai-track', expiryDate: '2025-12-31' },
    { id: 'hof-5', initials: 'JM', name: 'Joseph Mensah',    school: 'Tamale SHS',      year: '2022', badge: '💡 Innovation Prize', trackClass: 'innovation-track', expiryDate: '2024-12-31' },
    { id: 'hof-6', initials: 'SA', name: 'Serwa Amponsah',   school: 'PRESEC Legon',    year: '2022', badge: '⚡ Algorithm Sprint', trackClass: 'coding-track', expiryDate: '2024-12-31' },
    { id: 'hof-7', initials: 'DT', name: 'Daniel Tetteh',    school: 'Mfantsipim',      year: '2022', badge: '🔩 Robotics Gold',   trackClass: 'robotics-track', expiryDate: '2024-12-31' },
    { id: 'hof-8', initials: 'FA', name: 'Fatima Alhassan',  school: 'Tamale SHS',      year: '2021', badge: '🛡️ Cyber Shield',   trackClass: 'cyber-track', expiryDate: '2023-12-31' }
  ];

  private readonly defaultLeaderboard: LeaderboardEntry[] = [
    {
      id: 'lb-1',
      rank: '01',
      schoolName: "Presbyterian Boys' Sec. School (PRESEC)",
      location: 'Legon, Greater Accra Region',
      points: 490,
      trackPoints: { all: 490, coding: 130, robotics: 120, ai: 110, cyber: 130 },
      region: 'Accra'
    },
    {
      id: 'lb-2',
      rank: '02',
      schoolName: 'Achimota School',
      location: 'Achimota, Greater Accra Region',
      points: 465,
      trackPoints: { all: 465, coding: 100, robotics: 140, ai: 115, cyber: 110 },
      region: 'Accra'
    },
    {
      id: 'lb-3',
      rank: '03',
      schoolName: 'Prempeh College',
      location: 'Kumasi, Ashanti Region',
      points: 450,
      trackPoints: { all: 450, coding: 110, robotics: 110, ai: 120, cyber: 110 },
      region: 'Ashanti'
    },
    {
      id: 'lb-4',
      rank: '04',
      schoolName: "Wesley Girls' High School",
      location: 'Cape Coast, Central Region',
      points: 435,
      trackPoints: { all: 435, coding: 120, robotics: 90, ai: 105, cyber: 120 },
      region: 'Central'
    }
  ];

  private readonly defaultTalentDiscovery: TalentDiscovery[] = [
    { id: 'td-1', category: 'Algorithm Design', studentName: 'Sarah J.', schoolAndGrade: 'Newton Academy • Grade 11', score: '99.8%', badgeColor: 'primary' },
    { id: 'td-2', category: 'Robotics - CAD', studentName: 'Marcus K.', schoolAndGrade: 'Apex Tech High • Grade 12', score: '98.5%', badgeColor: 'secondary' },
    { id: 'td-3', category: 'Top Female Coder', studentName: 'Abena M.', schoolAndGrade: 'Wesley Girls • Grade 11', score: '97.2%', badgeColor: 'primary' },
    { id: 'td-4', category: 'AI Development', studentName: 'Kofi A.', schoolAndGrade: 'PRESEC Legon • Grade 12', score: '96.8%', badgeColor: 'ai' }
  ];

  private readonly defaultStats: PlatformStats = {
    regions: 16,
    mentors: 800,
    schools: 180,
    students: 12,
    projects: 1.5,
    grants: 2
  };

  private readonly defaultHero: HeroSlide[] = [
    {
      id: 'slide-1',
      tag: 'National Championship',
      title: "Where Ghana's Brightest Minds Compete & Innovate",
      description: 'Bringing together high school teams from all 16 regions to solve real-world problems through Coding, Robotics, AI, Cybersecurity, and Open Innovation.',
      image: 'assets/ntic_image_8.jpeg',
      ctaText: 'Enter Portal',
      ctaLink: '#portal'
    }
  ];

  private readonly defaultNews: NewsFeedItem[] = [
    { id: 'news-1', headline: 'Phase 2 Competition Opens for All Regions', tag: 'Announcement', date: 'Jun 20, 2026', link: '#' },
    { id: 'news-2', headline: 'New Sponsor: Vodafone Ghana Joins as Gold Partner', tag: 'Sponsorship', date: 'Jun 18, 2026', link: '#' },
    { id: 'news-3', headline: 'Leaderboard Updated After Regional Heats', tag: 'Results', date: 'Jun 15, 2026', link: '#' }
  ];

  private readonly defaultUsers: User[] = [
    {
      id: 'USR-000',
      role: 'super_admin',
      fullName: 'Admin',
      email: 'admin@ntic.gov.gh',
      phone: '+233 20 000 0000',
      otp: 'admin123',
      organization: 'NTIC',
      ticket: 'NTIC-ADM-0000',
      status: 'Active',
      registeredAt: 'Jan 1, 2026',
      lastLogin: 'Just now'
    },
    {
      id: 'USR-001',
      role: 'judge',
      fullName: 'Prof. Yaw Osei',
      email: 'y.osei@ug.edu.gh',
      phone: '+233 24 456 7890',
      otp: '482019',
      organization: 'University of Ghana',
      track: 'Coding & Algorithms',
      ticket: 'NTIC-JDG-7X4K',
      status: 'Active',
      registeredAt: 'Jun 15, 2026',
      lastLogin: '2h ago'
    },
    {
      id: 'USR-002',
      role: 'judge',
      fullName: 'Dr. Efua Boateng',
      email: 'eboateng@knust.edu.gh',
      phone: '+233 20 987 6543',
      otp: '821039',
      organization: 'KNUST',
      track: 'Robotics & IoT',
      ticket: 'NTIC-JDG-9M2R',
      status: 'Active',
      registeredAt: 'Jun 16, 2026',
      lastLogin: '1d ago'
    },
    {
      id: 'USR-003',
      role: 'sponsor',
      fullName: 'Sampson Cudjoe',
      email: 'sponsorship@tullowghana.com',
      phone: '+233 27 654 3210',
      otp: '372810',
      organization: 'Tullow Ghana',
      tier: 'Platinum',
      ticket: 'NTIC-SPO-3P8W',
      status: 'Active',
      registeredAt: 'Jun 10, 2026',
      lastLogin: '3d ago'
    },
    {
      id: 'USR-004',
      role: 'sponsor',
      fullName: 'Abena Kuffour',
      email: 'akuffour@mtn.com.gh',
      phone: '+233 55 123 4567',
      otp: '194820',
      organization: 'MTN Ghana Foundation',
      tier: 'Gold',
      ticket: 'NTIC-SPO-6F1D',
      status: 'Pending',
      registeredAt: 'Jun 22, 2026',
      lastLogin: 'Never'
    },
    {
      id: 'USR-005',
      role: 'judge',
      fullName: 'Mr. Kofi Antwi',
      email: 'kantwi@gctu.edu.gh',
      phone: '+233 24 888 1111',
      otp: '294029',
      organization: 'GCTU',
      track: 'Cybersecurity CTF',
      ticket: 'NTIC-JDG-2H5N',
      status: 'Active',
      registeredAt: 'Jun 18, 2026',
      lastLogin: '5h ago'
    }
  ];

  private readonly defaultPendingApprovals: ApprovalRequest[] = [
    { 
      id: 'REQ-001', 
      type: 'School Registration', 
      entity: 'Opoku Ware School', 
      contact: 'headmaster@ows.edu.gh', 
      submitted: '2h ago',
      details: {
        region: 'Ashanti Region',
        phone: '+233 24 555 1234',
        code: 'OWS-ASH-2026',
        tracks: 'Coding, Robotics, Cybersecurity',
        docs: ['Accreditation_OWS.pdf', 'Lab_Inventory.xlsx'],
        infra: 'Dual IT Labs, 30+ PCs, 100Mbps Fiber'
      }
    },
    { 
      id: 'REQ-002', 
      type: 'Team Addition', 
      entity: 'PRESEC AI Team Gamma', 
      contact: 'headmaster@presec.edu.gh', 
      submitted: '4h ago',
      details: {
        school: 'Presbyterian Boys Secondary School (Legon)',
        region: 'Greater Accra',
        track: 'Artificial Intelligence',
        project: 'Crop Diagnostics ML Sandbox Project',
        members: ['Yaw Osei', 'Kwabena Boateng', 'Sarah Mensah', 'Joseph Ofori'],
        coach: 'Mr. Emmanuel Kofi'
      }
    },
    { 
      id: 'REQ-003', 
      type: 'Instructor Access', 
      entity: 'Dr. Ama Serwaa', 
      contact: 'aserwaa@knust.edu.gh', 
      submitted: '6h ago',
      details: {
        institution: 'KNUST Department of Computer Science',
        credentials: 'PhD in Computer Science, CISSP, CEH',
        specialization: 'Cybersecurity CTF & Network Defense',
        experience: '8+ Years teaching, former MoCD security consultant',
        courses: ['LMS Course 204: Cryptography Sprints', 'LMS Course 301: Log Analysis']
      }
    },
    { 
      id: 'REQ-004', 
      type: 'School Registration', 
      entity: 'Tamale SHS', 
      contact: 'admin@tamishs.edu.gh', 
      submitted: '1d ago',
      details: {
        region: 'Northern Region',
        phone: '+233 20 888 4321',
        code: 'TAM-NOR-2026',
        tracks: 'Robotics, Open Innovation, AI',
        docs: ['TAM_SHS_Accreditation.pdf'],
        infra: 'Single Multi-Purpose ICT Lab, 20 working PCs'
      }
    }
  ];

  private readonly defaultTeams: Team[] = [
    { name: 'PRESEC Robotics Team A', track: 'Robotics', lead: 'Kofi Boateng', members: 5, status: 'Qualified', schoolName: "Presbyterian Boys' Sec. School (PRESEC)" },
    { name: 'PRESEC Coding Team Alpha', track: 'Coding', lead: 'Kwame Asante', members: 4, status: 'In Competition', schoolName: "Presbyterian Boys' Sec. School (PRESEC)" },
    { name: 'PRESEC AI Division', track: 'AI & ML', lead: 'Team Alpha', members: 6, status: 'Submitting', schoolName: "Presbyterian Boys' Sec. School (PRESEC)" },
    { name: 'Wesley Cyber Team', track: 'Cybersecurity', lead: 'Abena Acheampong', members: 4, status: 'In Competition', schoolName: "Wesley Girls' High School" },
    { name: 'Achimota Coders', track: 'Coding', lead: 'Efua Owusu', members: 5, status: 'In Competition', schoolName: 'Achimota School' }
  ];

  private readonly defaultSubmissions: Submission[] = [
    { id: 'sub-1', student: 'Kwame Asante', school: 'Achimota School', assignment: 'Dijkstra\'s Implementation', track: 'Coding', file: 'pathfinder_v2.py', score: null, status: 'pending', time: '10m ago', sourceCodePath: '/repos/coding/pathfinder_v2.py', videoUrl: 'https://video.nticportal.local/demo_pathfinder.mp4' },
    { id: 'sub-2', student: 'Abena Mensah', school: 'Wesley Girls', assignment: 'Line Follower Demo', track: 'Robotics', file: 'demo_run.mp4', score: null, status: 'pending', time: '1h ago', sourceCodePath: '/repos/robotics/line_follower.ino', videoUrl: 'https://video.nticportal.local/demo_9921.mp4' },
    { id: 'sub-3', student: 'Team Alpha', school: 'PRESEC Legon', assignment: 'Physics Engine Core', track: 'Coding', file: 'src_final_v3.zip', score: 62, status: 'resubmission', time: '2h ago', feedback: 'Great logic, but optimize the memory loop in your vector class to pass test case 4.' },
    { id: 'sub-4', student: 'Kofi Boateng', school: 'Prempeh College', assignment: 'SQL Injection Demo', track: 'Cybersecurity', file: 'writeup.pdf', score: 88, status: 'approved', time: '3h ago', feedback: 'Excellent explanation and defensive code recommendations.' },
    { id: 'sub-5', student: 'Ama Darko', school: 'Holy Child', assignment: 'AgriBot Prototype', track: 'Robotics', file: 'bot_demo.mp4', score: null, status: 'pending', time: '4h ago', sourceCodePath: '/repos/robotics/agribot_proto.cpp', videoUrl: 'https://video.nticportal.local/agribot.mp4' }
  ];

  private readonly defaultAuditLogs = [
    { action: 'User login from IP 197.220.44.12', user: 'admin@ntic.gov.gh', time: '2m ago', type: 'auth' },
    { action: 'Judge token NTIC-JDG-2H5N generated', user: 'admin@ntic.gov.gh', time: '18m ago', type: 'ticket' },
    { action: 'School registration approved: Aburi Girls', user: 'admin@ntic.gov.gh', time: '1h ago', type: 'approval' },
    { action: 'Database backup successfully stored', user: 'system', time: '1h ago', type: 'system' },
    { action: 'Sponsor token NTIC-SPO-6F1D generated', user: 'admin@ntic.gov.gh', time: '3h ago', type: 'ticket' },
    { action: 'Competition Phase 2 activated', user: 'admin@ntic.gov.gh', time: '5h ago', type: 'system' }
  ];

  private readonly defaultCsrUpdates = [
    { title: 'Laptops Delivered', desc: '15 modern engineering laptops delivered to Achimota Lab', time: 'Yesterday' },
    { title: 'Robotics Kits Dispatched', desc: '20 Arduino base kits dispatched to Wesley Girls', time: '3 days ago' },
    { title: 'Internship Program Open', desc: 'Sponsor internship applications open to top 5% talent', time: '1 week ago' }
  ];

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
    this.teams = teamsList;
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
    const newComp = { id, ...comp };
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
