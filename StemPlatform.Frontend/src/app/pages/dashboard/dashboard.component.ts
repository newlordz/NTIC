import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  activeRoleId = 'super_admin';
  dashboardTitle = 'Dashboard';
  dashboardSubtitle = 'STEM Platform Portal';

  stats: any[] = [];

  // Role-Specific Data

  // Student
  enrolledTracks = [
    { name: 'Python Data Structures', icon: 'data_object', progress: 68, lastActive: '2 days ago', module: 'Module 4 of 8', color: 'primary' },
    { name: 'Intro to Neural Networks', icon: 'model_training', progress: 15, lastActive: '1 week ago', module: 'Module 1 of 6', color: 'tertiary' }
  ];
  mySubmissions = [
    { track: 'Coding', file: 'binary_search.py', date: 'June 15, 2026', status: 'Approved', feedback: 'Excellent time complexity implementation!' },
    { track: 'AI & ML', file: 'regression_model.py', date: 'June 17, 2026', status: 'Pending', feedback: 'Awaiting mentor evaluation' }
  ];

  // Instructor
  recentSubmissions = [
    { name: 'Kwame Asante', school: 'Achimota School', track: 'coding', file: 'pathfinder_v2.py', time: '10m ago', status: 'pending' },
    { name: 'Abena Mensah', school: 'Wesley Girls', track: 'robotics', file: 'line_follower.ino', time: '1h ago', status: 'pending' },
    { name: 'Team Alpha', school: 'PRESEC Legon', track: 'ai', file: 'chatbot_model.py', time: '2h ago', status: 'resubmission' },
    { name: 'Kofi Boateng', school: 'Prempeh College', track: 'cyber', file: 'ctf_writeup.pdf', time: '3h ago', status: 'approved' },
    { name: 'Ama Darko', school: 'Holy Child', track: 'innovation', file: 'agri_pitch.pdf', time: '4h ago', status: 'pending' },
  ];
  activeTracks = [
    { name: 'Python Data Structures', icon: 'data_object', module: 'Module 4 of 8', enrolled: 320, completion: 68, color: 'primary', status: 'In Progress' },
    { name: 'Arduino Robotics Base', icon: 'memory', module: 'Module 3 of 6', enrolled: 180, completion: 42, color: 'secondary', status: 'In Progress' },
    { name: 'Intro to Neural Networks', icon: 'model_training', module: 'Starting Soon', enrolled: 85, completion: 85, color: 'tertiary', status: 'Planning' },
    { name: 'Ethical Hacking 101', icon: 'security', module: 'Module 1 of 5', enrolled: 140, completion: 22, color: 'error', status: 'In Progress' },
    { name: 'Design Thinking Sprint', icon: 'tips_and_updates', module: 'Module 2 of 4', enrolled: 210, completion: 55, color: 'primary', status: 'In Progress' },
    { name: 'Web Dev Bootcamp', icon: 'code', module: 'Module 6 of 10', enrolled: 290, completion: 61, color: 'secondary', status: 'In Progress' },
  ];

  // School Admin
  registeredTeams = [
    { name: 'PRESEC Robotics Team A', track: 'Robotics', lead: 'Kofi Boateng', members: 5, status: 'Qualified' },
    { name: 'PRESEC Coding Team Alpha', track: 'Coding', lead: 'Kwame Asante', members: 4, status: 'In Competition' },
    { name: 'PRESEC AI Division', track: 'AI & ML', lead: 'Team Alpha', members: 6, status: 'Submitting' }
  ];
  milestoneActivity = [
    { text: 'Robotics Team A completed Module 3 base assessment', time: '1h ago' },
    { text: 'Coding Team Alpha submitted pathfinder_v2.py', time: '3h ago' },
    { text: 'Mentor feedback published for AI Division', time: '5h ago' }
  ];

  // Judge
  assignedSubmissions = [
    { team: 'Wesley Girls Coding B', project: 'Pathfinder Visualizer', track: 'Coding', submitted: '1h ago', score: null },
    { team: 'PRESEC Legon AI Alpha', project: 'Crop Disease Classifier', track: 'AI & ML', submitted: '3h ago', score: 88 },
    { team: 'Achimota Cyber Unit', project: 'Firewall Auditing Tool', track: 'Cybersecurity', submitted: '5h ago', score: 92 },
    { team: 'Aburi Girls Innovate', project: 'Smart Irrigation Pitch', track: 'Innovation', submitted: '1d ago', score: null }
  ];
  recentScores = [
    { team: 'PRESEC Legon AI Alpha', score: 88, criterion: 'Technical Depth', date: '2h ago' },
    { team: 'Achimota Cyber Unit', score: 92, criterion: 'Security Audit', date: '4h ago' }
  ];

  // Sponsor
  sponsoredTeams = [
    { school: 'Wesley Girls', team: 'Wesley Cyber Team', track: 'Cybersecurity', sponsorship: '₵ 20,000', performance: 'Top 5%' },
    { school: 'Achimota School', team: 'Achimota Coders', track: 'Coding', sponsorship: '₵ 15,000', performance: 'Top 10%' },
    { school: 'PRESEC Legon', team: 'PRESEC Robotics B', track: 'Robotics', sponsorship: '₵ 30,000', performance: 'Top 2%' }
  ];
  csrUpdates = [
    { title: 'Laptops Delivered', desc: '15 modern engineering laptops delivered to Achimota Lab', time: 'Yesterday' },
    { title: 'Robotics Kits Dispatched', desc: '20 Arduino base kits dispatched to Wesley Girls', time: '3 days ago' },
    { title: 'Internship Program Open', desc: 'Sponsor internship applications open to top 5% talent', time: '1 week ago' }
  ];

  // Super Admin
  systemNodes = [
    { name: 'Main Auth Service', status: 'Healthy', latency: '42ms', load: '12%', color: 'primary' },
    { name: 'LMS Storage Bucket', status: 'Healthy', latency: '85ms', load: '38%', color: 'secondary' },
    { name: 'Compiler & Sandbox VM', status: 'Healthy', latency: '110ms', load: '5%', color: 'tertiary' },
    { name: 'Analytics Engine DB', status: 'Healthy', latency: '15ms', load: '22%', color: 'error' }
  ];
  auditLogs = [
    { action: 'User login from IP 197.220.44.12', user: 'admin@stem.gov.gh', time: '2m ago' },
    { action: 'Database backup successfully stored', user: 'system', time: '1h ago' },
    { action: 'New school registered: Aburi Girls', user: 'headmistress@aburi.edu.gh', time: '3h ago' }
  ];

  ngOnInit(): void {
    this.activeRoleId = localStorage.getItem('activeRoleId') || 'student';
    this.loadDashboardData();
  }

  loadDashboardData(): void {
    switch (this.activeRoleId) {
      case 'student':
        this.dashboardTitle = 'Student Dashboard';
        this.dashboardSubtitle = 'Welcome back, Kwame Asante. Track your learning, submissions, and competition progress.';
        this.stats = [
          { label: 'My Total Points', value: '350 pts', icon: 'military_tech', meta: '+50 pts this week', color: 'primary' },
          { label: 'Course Progress', value: '68%', icon: 'school', meta: 'Module 4 of 8', color: 'secondary' },
          { label: 'Leaderboard Rank', value: '#12', icon: 'leaderboard', meta: 'Out of 1,248 students', color: 'tertiary' },
          { label: 'My Submissions', value: '2', icon: 'assignment_turned_in', meta: '1 Approved, 1 Pending', color: 'error' }
        ];
        break;

      case 'instructor':
        this.dashboardTitle = 'Instructor Dashboard';
        this.dashboardSubtitle = 'Overview of the National STEM Competition Platform';
        this.stats = [
          { label: 'Total Students', value: '1,248', icon: 'group', meta: '+12% this week', color: 'primary' },
          { label: 'Schools', value: '47', icon: 'account_balance', meta: '3 new this month', color: 'secondary' },
          { label: 'Pending Reviews', value: '42', icon: 'pending_actions', meta: 'Requires attention', color: 'error' },
          { label: 'Active Competitions', value: '5', icon: 'emoji_events', meta: 'Final round in 3 days', color: 'tertiary' }
        ];
        break;

      case 'school_admin':
        this.dashboardTitle = 'School Admin Dashboard';
        this.dashboardSubtitle = 'PRESEC Legon - STEM Analytics & Team Management';
        this.stats = [
          { label: 'Registered Students', value: '86', icon: 'group', meta: 'Across 3 teams', color: 'primary' },
          { label: 'Active Mentors', value: '4', icon: 'co_present', meta: 'Fully assigned', color: 'secondary' },
          { label: 'Average Score', value: '84.5%', icon: 'percent', meta: '+2.1% from midterm', color: 'tertiary' },
          { label: 'Regional Rank', value: '#3', icon: 'workspace_premium', meta: 'Greater Accra Region', color: 'error' }
        ];
        break;

      case 'judge':
        this.dashboardTitle = 'Judge Dashboard';
        this.dashboardSubtitle = 'National Competition Scoring Panel';
        this.stats = [
          { label: 'Assigned Submissions', value: '18', icon: 'gavel', meta: 'Coding & AI tracks', color: 'primary' },
          { label: 'Graded Projects', value: '14', icon: 'done_all', meta: '78% complete', color: 'secondary' },
          { label: 'Pending Evaluations', value: '4', icon: 'pending', meta: 'Due by Saturday', color: 'error' },
          { label: 'Average Score Given', value: '78.2', icon: 'bar_chart', meta: 'Standard bell curve', color: 'tertiary' }
        ];
        break;

      case 'sponsor':
        this.dashboardTitle = 'Sponsor Dashboard';
        this.dashboardSubtitle = 'Tullow Ghana Corporate Sponsorship & CSR Impact Panel';
        this.stats = [
          { label: 'Total Funding Committed', value: '₵ 240,000', icon: 'payments', meta: 'Tullow Ghana CSR', color: 'primary' },
          { label: 'Sponsored Schools', value: '12', icon: 'school', meta: 'Across 4 regions', color: 'secondary' },
          { label: 'Supported Students', value: '250', icon: 'child_care', meta: 'Scholarship program', color: 'tertiary' },
          { label: 'Flagged High-Talents', value: '15', icon: 'verified', meta: 'Ready for internship', color: 'error' }
        ];
        break;

      case 'super_admin':
        this.dashboardTitle = 'Super Admin Dashboard';
        this.dashboardSubtitle = 'System Administration & Platform Audits';
        this.stats = [
          { label: 'Total Registered Users', value: '1,542', icon: 'manage_accounts', meta: '6 distinct portals', color: 'primary' },
          { label: 'System Health Status', value: '100% Up', icon: 'cloud_done', meta: 'All nodes green', color: 'secondary' },
          { label: 'Critical Errors Logged', value: '0', icon: 'error_med', meta: 'Last 24 hours', color: 'error' },
          { label: 'Pending Approvals', value: '12', icon: 'verified_user', meta: 'Mentor / school requests', color: 'tertiary' }
        ];
        break;
    }
  }
}
