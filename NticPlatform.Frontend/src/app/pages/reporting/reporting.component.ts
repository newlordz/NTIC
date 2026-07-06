import { Component, OnInit } from '@angular/core';
import { CommonModule, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContentService } from '../../services/content.service';

@Component({
  selector: 'app-reporting',
  standalone: true,
  imports: [CommonModule, TitleCasePipe, FormsModule],
  templateUrl: './reporting.component.html',
  styleUrl: './reporting.component.scss'
})
export class ReportingComponent implements OnInit {
  activeTab = 'overview';
  activeRoleId = 'super_admin';
  userName = 'Administrator';
  schoolName = 'My School';

  selectedReportType = '';
  selectedFormat = 'PDF';
  dateFrom = '2026-06-01';
  dateTo = '2026-06-18';

  reports: any[] = [];
  auditLogs: any[] = [];
  downloadOffset = 0;
  reportToDelete: any = null;

  constructor(public contentService: ContentService) {}

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      this.activeRoleId = localStorage.getItem('activeRoleId') || 'super_admin';
      const activeUserStr = localStorage.getItem('activeUser');
      if (activeUserStr) {
        try {
          const user = JSON.parse(activeUserStr);
          this.userName = user.name || 'Administrator';
          this.schoolName = user.organization || 'Ghana Secondary Technical School';
        } catch (e) {}
      }
    }

    this.loadRoleData();
  }

  loadRoleData(): void {
    const teamsCount = this.contentService.teams.length;
    const studentsCount = this.contentService.teams.reduce((acc, t) => acc + (t.rosterList?.length || 0), 0);

    if (this.activeRoleId === 'school_admin') {
      this.selectedReportType = 'School Performance Summary';
      
      if (teamsCount > 0) {
        this.reports = [
          {
            title: `${this.schoolName} — Roster Export`,
            type: 'School',
            date: new Date().toISOString().split('T')[0],
            size: '1.2 MB',
            status: 'ready',
            icon: 'group'
          },
          {
            title: `${this.schoolName} — Compliance Summary`,
            type: 'School',
            date: new Date().toISOString().split('T')[0],
            size: '0.8 MB',
            status: 'ready',
            icon: 'account_balance'
          }
        ];
      } else {
        this.reports = [];
      }

      this.auditLogs = [
        { action: 'Admin Portal Login', user: this.userName, time: 'Just now', icon: 'login', color: 'primary' },
        { action: 'Institutional Profile Verified', user: 'NTIC System', time: 'Today', icon: 'verified', color: 'success' }
      ];

      if (teamsCount > 0) {
        this.contentService.teams.forEach(t => {
          this.auditLogs.unshift({
            action: `Squad Enlisted: ${t.name}`,
            user: this.userName,
            time: 'Recent',
            icon: 'group_add',
            color: 'secondary'
          });
        });
      }
    } else if (this.activeRoleId === 'instructor') {
      this.selectedReportType = 'Instructor Course Progress';
      this.reports = [
        { title: 'Cohort Assessment Breakdown', type: 'Instructor', date: new Date().toISOString().split('T')[0], size: '1.5 MB', status: 'ready', icon: 'badge' },
        { title: 'Student Assignment Completion', type: 'Student', date: new Date().toISOString().split('T')[0], size: '2.1 MB', status: 'ready', icon: 'assignment' }
      ];
      this.auditLogs = [
        { action: 'LMS Portal Access', user: this.userName, time: 'Just now', icon: 'login', color: 'primary' },
        { action: 'Curriculum Module Reviewed', user: this.userName, time: '09:30', icon: 'menu_book', color: 'secondary' }
      ];
    } else {
      this.selectedReportType = 'National Platform Overview';
      this.reports = [
        { title: 'National School Performance Report', type: 'School', date: '2026-06-17', size: '2.4 MB', status: 'ready', icon: 'account_balance' },
        { title: 'Student Progress Report — Q2', type: 'Student', date: '2026-06-15', size: '5.1 MB', status: 'ready', icon: 'person' },
        { title: 'Instructor Effectiveness Report', type: 'Instructor', date: '2026-06-10', size: '1.8 MB', status: 'ready', icon: 'badge' },
        { title: 'Sponsor Impact Report — MTN', type: 'Sponsor', date: '2026-06-08', size: '3.2 MB', status: 'ready', icon: 'handshake' },
        { title: 'Competition Results — Round 2', type: 'Competition', date: '2026-06-05', size: '4.4 MB', status: 'ready', icon: 'emoji_events' }
      ];
      this.auditLogs = [
        { action: 'Report Generated', user: 'Dr. Amponsah', time: '09:42', icon: 'description', color: 'primary' },
        { action: 'Student Registered', user: 'SchAdmin-ACC', time: '09:38', icon: 'person_add', color: 'secondary' },
        { action: 'Submission Approved', user: 'Instructor Boateng', time: '09:31', icon: 'task_alt', color: 'success' },
        { action: 'Competition Created', user: 'SuperAdmin', time: '09:15', icon: 'emoji_events', color: 'primary' },
        { action: 'Sponsor Login', user: 'MTN Portal', time: '08:55', icon: 'handshake', color: 'tertiary' }
      ];
    }

    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem(`ntic_reports_${this.activeRoleId}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && Array.isArray(parsed.reports)) {
            this.reports = parsed.reports;
            this.downloadOffset = parsed.downloadOffset || 0;
          }
        }
      } catch (e) {}
    }
  }

  saveReportsState(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(`ntic_reports_${this.activeRoleId}`, JSON.stringify({
        reports: this.reports,
        downloadOffset: this.downloadOffset
      }));
    } catch (e) {}
  }

  get reportsGeneratedCount(): number {
    return this.reports.length;
  }

  get downloadsCount(): number {
    let base = 1840;
    if (this.activeRoleId === 'school_admin') {
      base = this.reports.length * 3;
    } else if (this.activeRoleId === 'instructor') {
      base = this.reports.length * 5;
    }
    return base + (this.downloadOffset || 0);
  }

  get scheduledReportsCount(): number {
    if (this.activeRoleId === 'school_admin') {
      return 1;
    } else if (this.activeRoleId === 'instructor') {
      return 2;
    }
    return 12;
  }

  get generatingCount(): number {
    return this.reports.filter(r => r.status === 'generating').length;
  }

  get reportOptions(): string[] {
    if (this.activeRoleId === 'school_admin') {
      return [
        'School Performance Summary',
        'Student Squad Roster Export',
        'Mentor Assignment Report',
        'Regional Rank Analytics',
        'STEM Compliance Certificate'
      ];
    } else if (this.activeRoleId === 'instructor') {
      return [
        'Instructor Course Progress',
        'Student Cohort Grades',
        'Assignment Completion Analytics',
        'Lab Safety Compliance'
      ];
    }
    return [
      'National Platform Overview',
      'School Performance Report',
      'Student Progress Report',
      'Instructor Effectiveness',
      'Sponsor Impact Report',
      'Competition Results',
      'Executive Summary'
    ];
  }

  generateReport(): void {
    const reportTitle = this.selectedReportType || this.reportOptions[0];
    const newReport = {
      title: `${reportTitle} (${new Date().toLocaleDateString()})`,
      type: this.activeRoleId === 'school_admin' ? 'School' : this.activeRoleId === 'instructor' ? 'Instructor' : 'National',
      date: new Date().toISOString().split('T')[0],
      size: (Math.random() * 2 + 0.5).toFixed(1) + ' MB',
      status: 'generating',
      icon: 'description'
    };

    this.reports.unshift(newReport);
    this.saveReportsState();
    this.auditLogs.unshift({
      action: `Generated: ${reportTitle}`,
      user: this.userName,
      time: 'Just now',
      icon: 'add_chart',
      color: 'primary'
    });

    setTimeout(() => {
      newReport.status = 'ready';
      this.saveReportsState();
    }, 2500);
  }

  downloadReport(report: any, format: string): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    
    this.downloadOffset++;
    this.saveReportsState();

    const teamsCount = this.contentService.teams.length;
    const studentsCount = this.contentService.teams.reduce((acc, t) => acc + (t.rosterList?.length || 0), 0);
    const dateStr = new Date().toLocaleString();

    let content = `==========================================================\n`;
    content += `         NTIC NATIONAL COMPETITION PLATFORM\n`;
    content += `        OFFICIAL INSTITUTIONAL REPORT EXPORT\n`;
    content += `==========================================================\n\n`;
    content += `Report Title    : ${report.title}\n`;
    content += `Report Type     : ${report.type}\n`;
    content += `Export Format   : ${format}\n`;
    content += `Generated Date  : ${report.date}\n`;
    content += `Exported On     : ${dateStr}\n`;
    content += `Institution     : ${this.schoolName}\n`;
    content += `Compiled By     : ${this.userName} (${this.activeRoleId})\n\n`;
    content += `--- SUMMARY METRICS ---\n`;
    content += `Total Enlisted Squads   : ${teamsCount}\n`;
    content += `Total Active Students   : ${studentsCount}\n`;
    content += `Accreditation Status    : Verified & Active\n\n`;
    content += `--- SQUAD ROSTER DETAILS ---\n`;

    if (teamsCount > 0) {
      this.contentService.teams.forEach((t, i) => {
        content += `${i + 1}. Squad Name : ${t.name}\n`;
        content += `   Track      : ${t.track}\n`;
        content += `   Lead       : ${t.lead}\n`;
        content += `   Members    : ${t.rosterList?.join(', ') || 'N/A'}\n\n`;
      });
    } else {
      content += `No student squads have been registered under this institution yet.\n`;
    }

    content += `==========================================================\n`;
    content += `End of Official Report — Ghana Data Protection Act Compliant\n`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanTitle = report.title.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    a.download = `${cleanTitle}_export.${format === 'Excel' ? 'csv' : 'txt'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    this.auditLogs.unshift({
      action: `Exported (${format}): ${report.title}`,
      user: this.userName,
      time: 'Just now',
      icon: 'download',
      color: 'secondary'
    });
  }

  openDeleteModal(report: any): void {
    this.reportToDelete = report;
  }

  cancelDelete(): void {
    this.reportToDelete = null;
  }

  confirmDelete(): void {
    if (this.reportToDelete) {
      this.reports = this.reports.filter(r => r !== this.reportToDelete);
      this.saveReportsState();
      this.auditLogs.unshift({
        action: `Deleted Report: ${this.reportToDelete.title}`,
        user: this.userName,
        time: 'Just now',
        icon: 'delete',
        color: 'error'
      });
      this.reportToDelete = null;
    }
  }
}
