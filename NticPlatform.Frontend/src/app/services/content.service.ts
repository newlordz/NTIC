import { Injectable } from '@angular/core';
import { DataStorageService } from './data-storage.service';

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
  fullName: string;
  email: string;
  phone: string;
  password?: string;
  otp: string;
  organization: string;
  region?: string;
  track?: string;
  tier?: string;
  ticket: string;
  status: string;
  registeredAt: string;
  lastLogin: string;
  total?: string;
  package?: string;
  payments?: SponsorPayment[];
}

export interface ApprovalRequest {
  id: string;
  type: 'School Registration' | 'Team Addition' | 'Instructor Access';
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
    students?: { name: string; track: string; class: string }[];
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
  mentor?: string;
  motto?: string;
  rosterList?: string[];
  memberNames?: string[];
  memberList?: string[];
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

  private readonly defaultLmsCourses: LmsCourse[] = [
    { id: 'crs-1', title: 'Python Data Structures', track: 'coding', icon: 'data_object', level: 'Intermediate', description: 'Master lists, dicts, sets, and tuples for competitive programming.', modules: 8, enrolled: 320, completion: 68, status: 'active', createdAt: '2026-01-15', submittedBy: 'Dr. Ebenezer Mensah (Achimota School)', approvalStatus: 'approved' },
    { id: 'crs-2', title: 'Arduino Robotics Base', track: 'robotics', icon: 'memory', level: 'Beginner', description: 'Build and program your first autonomous robot with Arduino.', modules: 6, enrolled: 180, completion: 42, status: 'active', createdAt: '2026-01-20', submittedBy: 'Eng. Sarah Kwofie (PRESEC Legon)', approvalStatus: 'approved' },
    { id: 'crs-3', title: 'AI Fundamentals with TensorFlow', track: 'ai', icon: 'psychology', level: 'Intermediate', description: 'Train, evaluate, and deploy machine learning models.', modules: 10, enrolled: 210, completion: 55, status: 'active', createdAt: '2026-02-01', submittedBy: 'Prof. Kwesi Appiah (KNUST STEM Lab)', approvalStatus: 'approved' },
    { id: 'crs-4', title: 'Network Security Essentials', track: 'cyber', icon: 'shield', level: 'Beginner', description: 'Learn firewalls, encryption, and penetration testing basics.', modules: 7, enrolled: 145, completion: 38, status: 'active', createdAt: '2026-02-10', submittedBy: 'Dr. Ebenezer Mensah (Achimota School)', approvalStatus: 'approved' },
    { id: 'crs-5', title: 'Full-Stack Web Development', track: 'coding', icon: 'code', level: 'Advanced', description: 'End-to-end web apps with Angular, Node.js, and PostgreSQL.', modules: 12, enrolled: 260, completion: 45, status: 'active', createdAt: '2026-02-15', submittedBy: 'Eng. Sarah Kwofie (PRESEC Legon)', approvalStatus: 'approved' },
    { id: 'crs-6', title: 'IoT Sensor Networks', track: 'robotics', icon: 'sensors', level: 'Intermediate', description: 'Connect sensors, collect data, and build smart systems.', modules: 8, enrolled: 95, completion: 30, status: 'active', createdAt: '2026-03-01', submittedBy: 'Prof. Kwesi Appiah (KNUST STEM Lab)', approvalStatus: 'approved' },
    { id: 'crs-7', title: 'Deep Learning & Computer Vision', track: 'ai', icon: 'visibility', level: 'Advanced', description: 'CNNs, object detection, and real-time image classification.', modules: 9, enrolled: 130, completion: 25, status: 'draft', createdAt: '2026-03-10', submittedBy: 'Prof. Kwesi Appiah (KNUST STEM Lab)', approvalStatus: 'approved' },
    { id: 'crs-8', title: 'Ethical Hacking Lab', track: 'cyber', icon: 'bug_report', level: 'Advanced', description: 'Hands-on penetration testing in controlled lab environments.', modules: 10, enrolled: 88, completion: 20, status: 'active', createdAt: '2026-03-15', submittedBy: 'Dr. Ebenezer Mensah (Achimota School)', approvalStatus: 'approved' },
    { id: 'crs-9', title: 'Quantum Computing Intro', track: 'innovation', icon: 'science', level: 'Advanced', description: 'Qubits, quantum logic gates, and IBM Qiskit fundamentals.', modules: 5, enrolled: 0, completion: 0, status: 'active', createdAt: '2026-07-24', submittedBy: 'Dr. Ebenezer Mensah (Achimota School)', approvalStatus: 'pending' },
  ];

  private readonly defaultLmsModules: LmsModule[] = [
    { id: 'mod-1', courseId: 'crs-1', title: 'Arrays & Linked Lists', description: 'Sequential data storage and traversal algorithms.', order: 1, icon: 'view_list', status: 'published', submittedBy: 'Dr. Ebenezer Mensah', approvalStatus: 'approved' },
    { id: 'mod-2', courseId: 'crs-1', title: 'Stacks & Queues', description: 'LIFO and FIFO data structures with real-world use cases.', order: 2, icon: 'swap_vert', status: 'published', submittedBy: 'Dr. Ebenezer Mensah', approvalStatus: 'approved' },
    { id: 'mod-3', courseId: 'crs-1', title: 'Hash Tables', description: 'Key-value storage, collision handling, and O(1) lookups.', order: 3, icon: 'table_chart', status: 'published', submittedBy: 'Dr. Ebenezer Mensah', approvalStatus: 'approved' },
    { id: 'mod-4', courseId: 'crs-1', title: 'Binary Trees & Heaps', description: 'Hierarchical data and priority queue implementations.', order: 4, icon: 'account_tree', status: 'published', submittedBy: 'Dr. Ebenezer Mensah', approvalStatus: 'approved' },
    { id: 'mod-5', courseId: 'crs-2', title: 'GPIO Fundamentals', description: 'Digital I/O, PWM signals, and sensor interfacing.', order: 1, icon: 'electrical_services', status: 'published', submittedBy: 'Eng. Sarah Kwofie', approvalStatus: 'approved' },
    { id: 'mod-6', courseId: 'crs-2', title: 'Motor Control', description: 'DC motors, servos, and H-bridge circuits.', order: 2, icon: 'settings', status: 'published', submittedBy: 'Eng. Sarah Kwofie', approvalStatus: 'approved' },
    { id: 'mod-7', courseId: 'crs-3', title: 'Linear Algebra for ML', description: 'Vectors, matrices, and transformations in model training.', order: 1, icon: 'functions', status: 'published', submittedBy: 'Prof. Kwesi Appiah', approvalStatus: 'approved' },
    { id: 'mod-8', courseId: 'crs-3', title: 'Neural Network Basics', description: 'Perceptrons, activation functions, and backpropagation.', order: 2, icon: 'neurology', status: 'published', submittedBy: 'Prof. Kwesi Appiah', approvalStatus: 'approved' },
    { id: 'mod-9', courseId: 'crs-4', title: 'Network Protocols', description: 'TCP/IP, DNS, HTTP, and packet analysis.', order: 1, icon: 'lan', status: 'published', submittedBy: 'Dr. Ebenezer Mensah', approvalStatus: 'approved' },
    { id: 'mod-10', courseId: 'crs-4', title: 'Firewall Configuration', description: 'iptables, rulesets, and traffic filtering.', order: 2, icon: 'security', status: 'published', submittedBy: 'Dr. Ebenezer Mensah', approvalStatus: 'approved' },
    { id: 'mod-11', courseId: 'crs-9', title: 'Superposition & Qubits', description: 'Quantum states, Bloch sphere, and qubit initialization.', order: 1, icon: 'grain', status: 'published', submittedBy: 'Dr. Ebenezer Mensah', approvalStatus: 'pending' }
  ];

  private readonly defaultLmsMaterials: LmsMaterial[] = [
    { id: 'mat-1', courseId: 'crs-1', moduleId: 'mod-1', title: 'Arrays Lecture Notes', type: 'document', url: '', description: 'Comprehensive guide to array operations and Big-O.', createdAt: '2026-01-15', submittedBy: 'Dr. Ebenezer Mensah', approvalStatus: 'approved' },
    { id: 'mat-2', courseId: 'crs-1', moduleId: 'mod-1', title: 'Python Arrays Tutorial', type: 'video', url: 'https://youtube.com/watch?v=example1', description: 'Video walkthrough of array implementations in Python.', createdAt: '2026-01-16', submittedBy: 'Dr. Ebenezer Mensah', approvalStatus: 'approved' },
    { id: 'mat-3', courseId: 'crs-2', moduleId: 'mod-5', title: 'Arduino Wiring Guide', type: 'document', url: '', description: 'Step-by-step GPIO wiring diagrams.', createdAt: '2026-01-20', submittedBy: 'Eng. Sarah Kwofie', approvalStatus: 'approved' },
    { id: 'mat-4', courseId: 'crs-3', moduleId: 'mod-7', title: 'Linear Algebra Refresher', type: 'link', url: 'https://khanacademy.org/linear-algebra', description: 'Khan Academy linear algebra course.', createdAt: '2026-02-01', submittedBy: 'Prof. Kwesi Appiah', approvalStatus: 'approved' },
    { id: 'mat-5', courseId: 'crs-9', moduleId: 'mod-11', title: 'IBM Qiskit Starter Notebook', type: 'link', url: 'https://qiskit.org/documentation', description: 'Jupyter notebook starter for quantum circuit simulation.', createdAt: '2026-07-24', submittedBy: 'Dr. Ebenezer Mensah', approvalStatus: 'pending' }
  ];

  private readonly defaultLmsAssignments: LmsAssignment[] = [
    { id: 'asgn-1', courseId: 'crs-1', title: 'Array Manipulation Challenge', description: 'Solve 5 problems involving array rotation, merging, and searching.', dueDate: '2026-08-01', maxScore: 100, track: 'coding', status: 'active', createdAt: '2026-01-15', submittedBy: 'Dr. Ebenezer Mensah', approvalStatus: 'approved' },
    { id: 'asgn-2', courseId: 'crs-2', title: 'Build a Line Follower', description: 'Program an Arduino robot to follow a black line on white surface.', dueDate: '2026-08-05', maxScore: 100, track: 'robotics', status: 'active', createdAt: '2026-01-20', submittedBy: 'Eng. Sarah Kwofie', approvalStatus: 'approved' },
    { id: 'asgn-3', courseId: 'crs-3', title: 'MNIST Digit Classifier', description: 'Train a neural network to recognize handwritten digits with >95% accuracy.', dueDate: '2026-08-10', maxScore: 100, track: 'ai', status: 'active', createdAt: '2026-02-01', submittedBy: 'Prof. Kwesi Appiah', approvalStatus: 'approved' },
    { id: 'asgn-4', courseId: 'crs-4', title: 'Vulnerability Scan Report', description: 'Run a Nessus scan and produce a remediation report.', dueDate: '2026-08-12', maxScore: 100, track: 'cyber', status: 'draft', createdAt: '2026-02-10', submittedBy: 'Dr. Ebenezer Mensah', approvalStatus: 'approved' },
    { id: 'asgn-5', courseId: 'crs-9', title: 'Qiskit Circuit Simulation', description: 'Construct a 2-qubit Bell state circuit and measure state vector probabilities.', dueDate: '2026-08-20', maxScore: 100, track: 'innovation', status: 'active', createdAt: '2026-07-24', submittedBy: 'Dr. Ebenezer Mensah', approvalStatus: 'pending' }
  ];

  private readonly defaultLmsSubmissions: LmsSubmission[] = [
    { id: 'sub-1', assignmentId: 'asgn-1', courseId: 'crs-1', studentId: 'usr-101', studentName: 'Kwame Mensah', studentEmail: 'kwame@school.edu.gh', submittedAt: '2026-07-20 14:30', content: 'Implemented array rotation using reversal algorithm in O(n) time.', url: 'https://github.com/kwame/array-challenge', score: 95, status: 'graded', feedback: 'Excellent time complexity optimization!' },
    { id: 'sub-2', assignmentId: 'asgn-1', courseId: 'crs-1', studentId: 'usr-102', studentName: 'Abena Osei', studentEmail: 'abena@school.edu.gh', submittedAt: '2026-07-22 09:15', content: 'Submitted Python solution with unit tests for all 5 cases.', url: 'https://github.com/abena/python-arrays', status: 'submitted' },
    { id: 'sub-3', assignmentId: 'asgn-2', courseId: 'crs-2', studentId: 'usr-103', studentName: 'Kofi Annan', studentEmail: 'kofi@school.edu.gh', submittedAt: '2026-07-23 16:45', content: 'Arduino C++ line follower code with PID loop.', url: 'https://github.com/kofi/line-follower-robot', score: 88, status: 'graded', feedback: 'Good PID tuning. Servo delay could be reduced.' },
    { id: 'sub-4', assignmentId: 'asgn-3', courseId: 'crs-3', studentId: 'usr-104', studentName: 'Ama Boateng', studentEmail: 'ama@school.edu.gh', submittedAt: '2026-07-24 11:20', content: 'TensorFlow CNN model achieving 98.2% test accuracy.', url: 'https://colab.research.google.com/drive/mnist-nn', status: 'submitted' }
  ];

  private readonly defaultLmsEnrollments: LmsEnrollment[] = [
    { id: 'enr-1', courseId: 'crs-1', studentId: 'usr-101', studentName: 'Kwame Mensah', studentEmail: 'kwame@school.edu.gh', progressPct: 85, enrolledAt: '2026-01-16', lastActive: '2026-07-24', status: 'active' },
    { id: 'enr-2', courseId: 'crs-1', studentId: 'usr-102', studentName: 'Abena Osei', studentEmail: 'abena@school.edu.gh', progressPct: 60, enrolledAt: '2026-01-18', lastActive: '2026-07-23', status: 'active' },
    { id: 'enr-3', courseId: 'crs-2', studentId: 'usr-103', studentName: 'Kofi Annan', studentEmail: 'kofi@school.edu.gh', progressPct: 100, enrolledAt: '2026-01-21', lastActive: '2026-07-24', status: 'completed' },
    { id: 'enr-4', courseId: 'crs-3', studentId: 'usr-104', studentName: 'Ama Boateng', studentEmail: 'ama@school.edu.gh', progressPct: 45, enrolledAt: '2026-02-02', lastActive: '2026-07-25', status: 'active' },
    { id: 'enr-5', courseId: 'crs-4', studentId: 'usr-105', studentName: 'Yaw Appiah', studentEmail: 'yaw@school.edu.gh', progressPct: 30, enrolledAt: '2026-02-12', lastActive: '2026-07-20', status: 'active' }
  ];
  private readonly defaultEvents: UpcomingEvent[] = [
    { id: 'evt-1', month: 'AUG', day: '15', title: 'Regional Qualifier — Greater Accra', description: 'STEM teams compete for national qualification spots across all 5 tracks.', location: 'Accra International Conference Centre' },
    { id: 'evt-2', month: 'SEP', day: '22', title: 'Regional Qualifier — Ashanti', description: 'Kumasi hosts the Ashanti regional championships with 40+ competing teams.', location: 'Kumasi Cultural Centre' },
    { id: 'evt-3', month: 'DEC', day: '07', title: 'National Grand Final', description: 'The ultimate showdown — top teams from all regions battle for the NTIC Championship crown.', location: 'National Theatre of Ghana, Accra' }
  ];
  private readonly defaultStories: ChampionshipStory[] = [
    {
      id: 'story-1', tag: 'Robotics', tagColor: 'robotics',
      image: 'assets/ntic_image_1.jpeg', date: 'June 28, 2026', readTime: '5 min',
      title: 'Achimota School Builds Autonomous Rover for Desert Navigation',
      body: 'Team Volta from Achimota School developed an autonomous rover capable of navigating uneven terrain using computer vision and LIDAR sensors, winning the Regional Robotics Qualifier in Greater Accra.',
      likes: 24, likedBy: []
    },
    {
      id: 'story-2', tag: 'Coding', tagColor: 'coding',
      image: 'assets/ntic_image_2.jpeg', date: 'June 22, 2026', readTime: '4 min',
      title: "Wesley Girls' Coding Team Ships a Full-Stack Health App in 48 Hours",
      body: "During the national hackathon sprint, a 4-student team from Wesley Girls' built and deployed a telemedicine platform connecting rural clinics with urban doctors — all within a 48-hour deadline.",
      likes: 18, likedBy: []
    },
    {
      id: 'story-3', tag: 'Cybersecurity', tagColor: 'cyber',
      image: 'assets/ntic_image_3.jpeg', date: 'June 15, 2026', readTime: '6 min',
      title: 'PRESEC Legon Students Simulate a Nation-State Cyber Attack in Finals',
      body: 'The cybersecurity track finale saw PRESEC Legon team execute a realistic nation-state attack simulation, demonstrating advanced penetration testing skills and incident response protocols.',
      likes: 31, likedBy: []
    },
    {
      id: 'story-4', tag: 'AI', tagColor: 'ai',
      image: 'assets/ntic_image_4.jpeg', date: 'June 10, 2026', readTime: '5 min',
      title: 'Opoku War School AI Team Trains a Local Language Speech Recognition Model',
      body: 'Using transfer learning on a small dataset, students from Opoku War School built a Twi speech recognition model achieving 87% accuracy — a breakthrough for local language AI in Ghana.',
      likes: 15, likedBy: []
    },
    {
      id: 'story-5', tag: 'Innovation', tagColor: 'innovation',
      image: 'assets/ntic_image_5.jpeg', date: 'June 5, 2026', readTime: '4 min',
      title: "St. Augustine's Invents a Solar-Powered Water Purification System",
      body: "Team Innovation from St. Augustine's College designed a low-cost solar-powered water purification unit capable of serving 200 households, addressing clean water access in rural communities.",
      likes: 12, likedBy: []
    },
    {
      id: 'story-6', tag: 'Robotics', tagColor: 'robotics',
      image: 'assets/ntic_image_1.jpeg', date: 'May 30, 2026', readTime: '3 min',
      title: "Adisadel College Robotics Team Wins People's Choice Award",
      body: "Their humanoid robot performing traditional Ghanaian dance moves captured hearts at the national exhibition, earning the People's Choice Award alongside a top-3 finish in the main robotics competition.",
      likes: 20, likedBy: []
    }
  ];

  private readonly defaultHof: HallOfFameEntry[] = [
    {
      id: 'hof-group-1',
      type: 'group',
      initials: 'CR',
      name: 'CyberRangers',
      teamName: 'CyberRangers Squad',
      projectTitle: 'Zero-Trust Autonomous Firewall System',
      members: ['Kofi Nyarko', 'Abena Mensah', 'Emmanuel Osei', 'Selorm Adjei'],
      school: 'Prempeh College',
      year: '2025',
      badge: '🏆 Cybersecurity Grand Champions',
      trackClass: 'cyber-track'
    },
    {
      id: 'hof-1',
      type: 'individual',
      initials: 'EA',
      name: 'Ekow Asante',
      school: 'Mfantsipim School',
      year: '2025',
      badge: 'Coding Champion',
      trackClass: 'coding-track'
    },
    {
      id: 'hof-group-2',
      type: 'group',
      initials: 'AI',
      name: 'RoboQuest Alpha',
      teamName: 'RoboQuest Alpha',
      projectTitle: 'Solar Autonomous Agri-Rover',
      members: ['Abigail Serwaa', 'Akosua Baako', 'Ama Opoku'],
      school: 'Wesley Girls High School',
      year: '2025',
      badge: '🤖 Robotics Team Champions',
      trackClass: 'robotics-track'
    },
    {
      id: 'hof-3',
      type: 'individual',
      initials: 'KN',
      name: 'Kofi Nyarko',
      school: 'Prempeh College',
      year: '2024',
      badge: 'AI Champion',
      trackClass: 'ai-track'
    },
    {
      id: 'hof-4',
      type: 'individual',
      initials: 'ED',
      name: 'Efua Donkor',
      school: 'Achimota School',
      year: '2024',
      badge: 'Innovation Champion',
      trackClass: 'innovation-track'
    }
  ];

  private readonly defaultLeaderboard: LeaderboardEntry[] = [];

  private readonly defaultTalentDiscovery: TalentDiscovery[] = [];

  private readonly defaultStats: PlatformStats = { regions: 0, mentors: 0, schools: 0, students: 0, projects: 0, grants: 0 };

  private readonly defaultHero: HeroSlide[] = [
    {
      id: 'slide-1',
      tag: 'National Championship',
      title: 'Where Ghana\'s Brightest Minds Compete & Innovate',
      description: 'Bringing together high school teams from all 16 regions to solve real-world problems through Coding, Robotics, AI, Cybersecurity, and Open Innovation.',
      image: 'assets/ntic_image_8.jpeg',
      ctaText: 'Enter Portal',
      ctaLink: '#portal'
    }
  ];

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
  private readonly defaultRejectedApprovals: ApprovalRequest[] = [];
  private readonly defaultApprovedApprovals: ApprovalRequest[] = [];

  private readonly defaultTeams: Team[] = [
    {
      id: 'team-1',
      name: 'CyberRangers Squad',
      track: 'Cybersecurity',
      lead: 'Kofi Nyarko',
      members: 4,
      status: 'Qualified',
      schoolName: 'Prempeh College',
      mentor: 'Dr. Emmanuel Osei',
      motto: 'Shielding Ghana Digital Frontier',
      rosterList: ['Kofi Nyarko', 'Abena Mensah', 'Emmanuel Osei', 'Selorm Adjei']
    },
    {
      id: 'team-2',
      name: 'RoboQuest Alpha',
      track: 'Robotics',
      lead: 'Abigail Serwaa',
      members: 3,
      status: 'Qualified',
      schoolName: 'Wesley Girls High School',
      mentor: 'Mrs. Efua Mensah',
      motto: 'Automating Tomorrow',
      rosterList: ['Abigail Serwaa', 'Akosua Baako', 'Ama Opoku']
    },
    {
      id: 'team-3',
      name: 'Apex Coders',
      track: 'Coding',
      lead: 'Ekow Asante',
      members: 4,
      status: 'Qualified',
      schoolName: 'Mfantsipim School',
      mentor: 'Mr. Sampson Cudjoe',
      motto: 'Logic Meets Innovation',
      rosterList: ['Ekow Asante', 'Kweku Addo', 'Paa Kwesi', 'Yao Mensah']
    }
  ];

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
      if (type === 'group' && (!members || members.length === 0)) {
        // Auto-generate sample roster if squad entry lacks member details
        if (entry.name && entry.name.toLowerCase().includes('gsts')) {
          members = ['Kofi Boateng', 'Yaw Appiah', 'Seth Addo', 'Emmanuel Quaye'];
        } else if (entry.teamName || entry.name) {
          members = ['Kwame Asante', 'Abena Mensah', 'Kofi Nyarko', 'Efua Donkor'];
        }
      }

      return {
        ...entry,
        type,
        members: members || []
      };
    });
  }

  constructor(private dataStorage: DataStorageService) {
    this.loadStateAndFallback();
    this.migrateToIndexedDB();
  }

  private loadStateAndFallback(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      // Basic ContentService data — small, sync is fine
      this.championshipStories = this.loadKeySync('championshipStories', this.defaultStories);
      this.hallOfFameEntries = this.enrichHofEntries(this.loadKeySync('hallOfFameEntries', this.defaultHof));
      this.upcomingEvents = this.loadKeySync('upcomingEvents', this.defaultEvents);
      this.leaderboardData = this.loadKeySync('leaderboardData', this.defaultLeaderboard);
      this.talentDiscovery = this.loadKeySync('talentDiscovery', this.defaultTalentDiscovery);
      this.platformStats = this.loadKeySync('platformStats', this.defaultStats);
      this.heroSlides = this.loadKeySync('heroSlides', this.defaultHero);
      this.newsFeedItems = this.loadKeySync('newsFeedItems', this.defaultNews);
      
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

      // Large datasets — load from localStorage first (sync), then async upgrade to IndexedDB
      this.users = this.deduplicateUsers(this.loadKeySync('users', this.defaultUsers));
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
    const largeKeys = ['users', 'pendingApprovals', 'rejectedApprovals', 'approvedApprovals', 'teams', 'submissions', 'auditLogs'];
    for (const key of largeKeys) {
      await this.loadKeyAsync(key, (this as any)[key]);
    }
    this.storageReady = true;
  }

  private saveState(key: string, data: any): void {
    const json = JSON.stringify(data);
    const isLargeCollection = ['users', 'pendingApprovals', 'rejectedApprovals', 'approvedApprovals', 'teams', 'submissions', 'auditLogs'].includes(key);

    if (isLargeCollection) {
      // Use IndexedDB for large collections — no size limit
      this.dataStorage.set(key, data).catch(() => {});
      // Also write to localStorage as fallback (may fail silently for large data)
      try { localStorage.setItem(key, json); } catch { /* quota exceeded, IndexedDB has it */ }
    } else {
      // Small data — localStorage is fine
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

  // ── CRUD Upcoming Events ───────────────────────────────────────────

  addEvent(event: Omit<UpcomingEvent, 'id'>): void {
    const id = 'evt-' + Date.now();
    this.upcomingEvents.push({ id, ...event });
    this.upcomingEvents = [...this.upcomingEvents];
    this.saveState('upcomingEvents', this.upcomingEvents);
  }

  removeEvent(id: string): void {
    this.upcomingEvents = this.upcomingEvents.filter(e => e.id !== id);
    this.saveState('upcomingEvents', this.upcomingEvents);
  }

  updateEvent(event: UpcomingEvent): void {
    const idx = this.upcomingEvents.findIndex(e => e.id === event.id);
    if (idx !== -1) {
      this.upcomingEvents[idx] = { ...event };
      this.upcomingEvents = [...this.upcomingEvents];
      this.saveState('upcomingEvents', this.upcomingEvents);
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
    this.users = this.deduplicateUsers(usersList);
    this.saveState('users', this.users);
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
    if (this.approvedApprovals.some(a => a.id !== excludeId && (a.contact?.trim().toLowerCase() === e || a.details?.email?.trim().toLowerCase() === e || a.details?.repEmail?.trim().toLowerCase() === e))) return true;
    if (this.rejectedApprovals.some(a => a.id !== excludeId && (a.contact?.trim().toLowerCase() === e || a.details?.email?.trim().toLowerCase() === e || a.details?.repEmail?.trim().toLowerCase() === e))) return true;
    return false;
  }

  isValidGhanaPhone(phone: string): boolean {
    const cleaned = phone.replace(/[\s\-().]/g, '');
    if (/^\+233[0-9]{9}$/.test(cleaned)) return true;
    if (/^233[0-9]{9}$/.test(cleaned)) return true;
    if (/^0[0-9]{9}$/.test(cleaned)) return true;
    return false;
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
    if (this.approvedApprovals.some(a => a.id !== excludeId && (matches(a.contact) || matches(a.details?.phone) || matches(a.details?.repTel)))) return true;
    if (this.rejectedApprovals.some(a => a.id !== excludeId && (matches(a.contact) || matches(a.details?.phone) || matches(a.details?.repTel)))) return true;
    return false;
  }

  // ── Approval Management Helpers ──────────────────────────────────
  
  saveApprovals(approvalsList: ApprovalRequest[]): void {
    this.pendingApprovals = approvalsList;
    this.saveState('pendingApprovals', this.pendingApprovals);
  }

  saveRejectedApprovals(list: ApprovalRequest[]): void {
    this.rejectedApprovals = list;
    this.saveState('rejectedApprovals', this.rejectedApprovals);
  }

  saveApprovedApprovals(list: ApprovalRequest[]): void {
    this.approvedApprovals = list;
    this.saveState('approvedApprovals', this.approvedApprovals);
  }

  saveHeroSlides(slidesList: HeroSlide[]): void {
    this.heroSlides = slidesList;
    this.saveState('heroSlides', this.heroSlides);
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

      const auditLogsList = [
        {
          id: `LOG-${Date.now()}`,
          action: `Updated Competition: ${comp.title} (status: ${comp.status})`,
          user: localStorage.getItem('activeUserEmail') || 'System',
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

    if (found) {
      const auditLogsList = [
        {
          id: `LOG-${Date.now()}`,
          action: `Removed Competition: ${found.title}`,
          user: localStorage.getItem('activeUserEmail') || 'System',
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
  }

  saveLmsCourse(course: LmsCourse): void {
    const idx = this.lmsCourses.findIndex(c => c.id === course.id);
    if (idx >= 0) {
      this.lmsCourses[idx] = { ...course };
    } else {
      this.lmsCourses.push({ ...course });
    }
    this.saveState('lmsCourses', this.lmsCourses);
  }

  removeLmsCourse(id: string): void {
    this.lmsCourses = this.lmsCourses.filter(c => c.id !== id);
    this.lmsModules = this.lmsModules.filter(m => m.courseId !== id);
    this.lmsMaterials = this.lmsMaterials.filter(m => m.courseId !== id);
    this.lmsAssignments = this.lmsAssignments.filter(a => a.courseId !== id);
    this.saveState('lmsCourses', this.lmsCourses);
    this.saveState('lmsModules', this.lmsModules);
    this.saveState('lmsMaterials', this.lmsMaterials);
    this.saveState('lmsAssignments', this.lmsAssignments);
  }

  saveLmsModules(list: LmsModule[]): void {
    this.lmsModules = list;
    this.saveState('lmsModules', this.lmsModules);
  }

  saveLmsModule(mod: LmsModule): void {
    const idx = this.lmsModules.findIndex(m => m.id === mod.id);
    if (idx >= 0) {
      this.lmsModules[idx] = { ...mod };
    } else {
      this.lmsModules.push({ ...mod });
    }
    this.saveState('lmsModules', this.lmsModules);
  }

  removeLmsModule(id: string): void {
    this.lmsModules = this.lmsModules.filter(m => m.id !== id);
    this.lmsMaterials = this.lmsMaterials.filter(m => m.moduleId !== id);
    this.saveState('lmsModules', this.lmsModules);
    this.saveState('lmsMaterials', this.lmsMaterials);
  }

  saveLmsMaterials(list: LmsMaterial[]): void {
    this.lmsMaterials = list;
    this.saveState('lmsMaterials', this.lmsMaterials);
  }

  saveLmsMaterial(mat: LmsMaterial): void {
    const idx = this.lmsMaterials.findIndex(m => m.id === mat.id);
    if (idx >= 0) {
      this.lmsMaterials[idx] = { ...mat };
    } else {
      this.lmsMaterials.push({ ...mat });
    }
    this.saveState('lmsMaterials', this.lmsMaterials);
  }

  removeLmsMaterial(id: string): void {
    this.lmsMaterials = this.lmsMaterials.filter(m => m.id !== id);
    this.saveState('lmsMaterials', this.lmsMaterials);
  }

  saveLmsAssignments(list: LmsAssignment[]): void {
    this.lmsAssignments = list;
    this.saveState('lmsAssignments', this.lmsAssignments);
  }

  saveLmsAssignment(asgn: LmsAssignment): void {
    const idx = this.lmsAssignments.findIndex(a => a.id === asgn.id);
    if (idx >= 0) {
      this.lmsAssignments[idx] = { ...asgn };
    } else {
      this.lmsAssignments.push({ ...asgn });
    }
    this.saveState('lmsAssignments', this.lmsAssignments);
  }

  removeLmsAssignment(id: string): void {
    this.lmsAssignments = this.lmsAssignments.filter(a => a.id !== id);
    this.saveState('lmsAssignments', this.lmsAssignments);
  }

  gradeLmsSubmission(id: string, score: number, feedback: string): void {
    const sub = this.lmsSubmissions.find(s => s.id === id);
    if (sub) {
      sub.score = score;
      sub.feedback = feedback;
      sub.status = 'graded';
      this.saveState('lmsSubmissions', this.lmsSubmissions);
    }
  }

  requestSubmissionRevision(id: string, adminNotes: string): void {
    const sub = this.lmsSubmissions.find(s => s.id === id);
    if (sub) {
      sub.status = 'regrade_requested';
      sub.feedback = (sub.feedback ? sub.feedback + '\n\n' : '') + `[Admin Note — Instructor Revision Requested]: ${adminNotes}`;
      this.saveState('lmsSubmissions', this.lmsSubmissions);
    }
  }

  rejectLmsSubmission(id: string, adminNotes: string): void {
    const sub = this.lmsSubmissions.find(s => s.id === id);
    if (sub) {
      sub.status = 'rejected';
      sub.score = undefined;
      sub.feedback = (sub.feedback ? sub.feedback + '\n\n' : '') + `[Admin Note — Rejected, Resubmit Required]: ${adminNotes}`;
      this.saveState('lmsSubmissions', this.lmsSubmissions);
    }
  }

  saveLmsSubmissions(list: LmsSubmission[]): void {
    this.lmsSubmissions = list;
    this.saveState('lmsSubmissions', this.lmsSubmissions);
  }

  saveLmsEnrollments(list: LmsEnrollment[]): void {
    this.lmsEnrollments = list;
    this.saveState('lmsEnrollments', this.lmsEnrollments);
  }

  // ── LMS Moderation & Approvals ──────────────────────────────
  approveLmsItem(type: 'course' | 'module' | 'material' | 'assignment', id: string, adminEmail: string = 'admin@ntic.org.gh'): void {
    const timestamp = new Date().toISOString().split('T')[0];
    if (type === 'course') {
      const item = this.lmsCourses.find(c => c.id === id);
      if (item) { item.approvalStatus = 'approved'; item.reviewedBy = adminEmail; item.reviewedAt = timestamp; this.saveState('lmsCourses', this.lmsCourses); }
    } else if (type === 'module') {
      const item = this.lmsModules.find(m => m.id === id);
      if (item) { item.approvalStatus = 'approved'; item.reviewedBy = adminEmail; item.reviewedAt = timestamp; this.saveState('lmsModules', this.lmsModules); }
    } else if (type === 'material') {
      const item = this.lmsMaterials.find(m => m.id === id);
      if (item) { item.approvalStatus = 'approved'; item.reviewedBy = adminEmail; item.reviewedAt = timestamp; this.saveState('lmsMaterials', this.lmsMaterials); }
    } else if (type === 'assignment') {
      const item = this.lmsAssignments.find(a => a.id === id);
      if (item) { item.approvalStatus = 'approved'; item.reviewedBy = adminEmail; item.reviewedAt = timestamp; this.saveState('lmsAssignments', this.lmsAssignments); }
    }
  }

  rejectLmsItem(type: 'course' | 'module' | 'material' | 'assignment', id: string, reason: string, adminEmail: string = 'admin@ntic.org.gh'): void {
    const timestamp = new Date().toISOString().split('T')[0];
    if (type === 'course') {
      const item = this.lmsCourses.find(c => c.id === id);
      if (item) { item.approvalStatus = 'rejected'; item.rejectionReason = reason; item.reviewedBy = adminEmail; item.reviewedAt = timestamp; this.saveState('lmsCourses', this.lmsCourses); }
    } else if (type === 'module') {
      const item = this.lmsModules.find(m => m.id === id);
      if (item) { item.approvalStatus = 'rejected'; item.rejectionReason = reason; item.reviewedBy = adminEmail; item.reviewedAt = timestamp; this.saveState('lmsModules', this.lmsModules); }
    } else if (type === 'material') {
      const item = this.lmsMaterials.find(m => m.id === id);
      if (item) { item.approvalStatus = 'rejected'; item.rejectionReason = reason; item.reviewedBy = adminEmail; item.reviewedAt = timestamp; this.saveState('lmsMaterials', this.lmsMaterials); }
    } else if (type === 'assignment') {
      const item = this.lmsAssignments.find(a => a.id === id);
      if (item) { item.approvalStatus = 'rejected'; item.rejectionReason = reason; item.reviewedBy = adminEmail; item.reviewedAt = timestamp; this.saveState('lmsAssignments', this.lmsAssignments); }
    }
  }
}
