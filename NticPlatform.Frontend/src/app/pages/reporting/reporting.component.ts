import { getAuthValue } from '../../services/session.util';
import { Component, OnInit } from '@angular/core';
import { CommonModule, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContentService, Competition, Team } from '../../services/content.service';
import { TimeAgoPipe } from '../../services/time-ago.pipe';

@Component({
  selector: 'app-reporting',
  standalone: true,
  imports: [CommonModule, TitleCasePipe, FormsModule, TimeAgoPipe],
  templateUrl: './reporting.component.html',
  styleUrl: './reporting.component.scss'
})
export class ReportingComponent implements OnInit {
  activeTab = 'overview';
  activeRoleId = '';
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

  /**
   * Which competition cycle this report covers. Empty string means every cycle.
   *
   * Reports were previously always computed over every team on the platform, so
   * a "School Performance Summary" for one cycle silently included squads from
   * every other cycle -- and the exported file said nothing about which cycle it
   * covered, making two exports indistinguishable.
   */
  selectedCycleId = '';

  constructor(public contentService: ContentService) {}

  /** Cycles offered in the scope picker, newest first. */
  get cycleOptions(): Competition[] {
    return this.contentService.competitions;
  }

  /** Teams the current scope covers. */
  get scopedTeams(): Team[] {
    return this.selectedCycleId
      ? this.contentService.getTeamsForCompetition(this.selectedCycleId)
      : this.contentService.teams;
  }

  /** Human-readable scope, used in the UI and stamped into every export. */
  get scopeLabel(): string {
    if (!this.selectedCycleId) return 'All cycles';
    return this.contentService.getCompetition(this.selectedCycleId)?.title
      ?? 'Unknown cycle';
  }

  onCycleScopeChange(): void {
    // Counts shown on the page are derived in loadRoleData, so they have to be
    // recomputed when the scope changes or the page would keep the old figures.
    this.loadRoleData();
  }

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      this.activeRoleId = getAuthValue('activeRoleId') || '';
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
    const teamsCount = this.scopedTeams.length;
    const studentsCount = this.scopedTeams.reduce((acc, t) => acc + (t.rosterList?.length || 0), 0);

    if (this.activeRoleId === 'school_admin') {
      this.selectedReportType = 'School Performance Summary';
      this.reports = [];
      this.auditLogs = [
        { action: 'Admin Portal Login', user: this.userName, time: new Date().toISOString(), icon: 'login', color: 'primary' },
        { action: 'Institutional Profile Verified', user: 'NTIC System', time: new Date().toISOString(), icon: 'verified', color: 'success' }
      ];
    } else if (this.activeRoleId === 'instructor') {
      this.selectedReportType = 'Instructor Course Progress';
      this.reports = [];
      this.auditLogs = [
        { action: 'LMS Portal Access', user: this.userName, time: new Date().toISOString(), icon: 'login', color: 'primary' },
        { action: 'Curriculum Module Reviewed', user: this.userName, time: '09:30', icon: 'menu_book', color: 'secondary' }
      ];
    } else {
      this.selectedReportType = 'National Platform Overview';
      this.reports = [];
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
        'NTI Compliance Certificate'
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

    const typeMap: Record<string, string> = {
      'School Performance Summary': 'School',
      'National Platform Overview': 'National',
      'School Performance Report': 'School',
      'Student Progress Report': 'Student',
      'Student Progress Report - Q2': 'Student',
      'Instructor Effectiveness': 'Instructor',
      'Instructor Course Progress': 'Instructor',
      'Instructor Effectiveness Report': 'Instructor',
      'Sponsor Impact Report': 'Sponsor',
      'Sponsor Impact Report - MTN': 'Sponsor',
      'Competition Results': 'Competition',
      'Competition Results - Round 2': 'Competition',
      'Executive Summary': 'National',
      'Student Squad Roster Export': 'School',
      'Mentor Assignment Report': 'School',
      'Regional Rank Analytics': 'School',
      'NTI Compliance Certificate': 'School',
      'Student Cohort Grades': 'Student',
      'Assignment Completion Analytics': 'Student',
      'Lab Safety Compliance': 'Instructor',
      'Cohort Assessment Breakdown': 'Instructor',
      'Student Assignment Completion': 'Student'
    };

    const type = typeMap[reportTitle] || (
      this.activeRoleId === 'school_admin' ? 'School' :
      this.activeRoleId === 'instructor' ? 'Instructor' : 'National'
    );

    const iconMap: Record<string, string> = {
      'School': 'account_balance',
      'Student': 'person',
      'Instructor': 'badge',
      'Sponsor': 'handshake',
      'Competition': 'emoji_events',
      'National': 'public'
    };

    const newReport = {
      title: `${reportTitle} (${new Date().toLocaleDateString()})`,
      type,
      date: new Date().toISOString().split('T')[0],
      size: (Math.random() * 2 + 0.5).toFixed(1) + ' MB',
      status: 'generating',
      icon: iconMap[type] || 'description'
    };

    this.reports.unshift(newReport);
    this.saveReportsState();
    this.auditLogs.unshift({
      action: `Generated: ${reportTitle}`,
      user: this.userName,
      time: new Date().toISOString(),
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

    const scopedTeams = this.scopedTeams;
    const teamsCount = scopedTeams.length;
    const studentsCount = scopedTeams.reduce((acc, t) => acc + (t.rosterList?.length || 0), 0);
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
    // Without this the file gives no way to tell which cycle it covers, so two
    // exports taken at different scopes look identical.
    content += `Cycle Scope     : ${this.scopeLabel}\n`;
    content += `Compiled By     : ${this.userName} (${this.activeRoleId})\n\n`;
    content += `--- SUMMARY METRICS ---\n`;
    content += `Total Enlisted Squads   : ${teamsCount}\n`;
    content += `Total Active Students   : ${studentsCount}\n`;
    content += `Accreditation Status    : Verified & Active\n\n`;
    content += `--- SQUAD ROSTER DETAILS ---\n`;

    if (teamsCount > 0) {
      scopedTeams.forEach((t, i) => {
        content += `${i + 1}. Squad Name : ${t.name}\n`;
        content += `   Track      : ${t.track}\n`;
        content += `   Lead       : ${t.lead}\n`;
        content += `   Members    : ${t.rosterList?.join(', ') || 'N/A'}\n\n`;
      });
    } else {
      content += this.selectedCycleId
        ? `No student squads are registered for ${this.scopeLabel}.\n`
        : `No student squads have been registered under this institution yet.\n`;
    }

    content += `==========================================================\n`;
    content += `End of Official Report - Ghana Data Protection Act Compliant\n`;

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
      time: new Date().toISOString(),
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
        time: new Date().toISOString(),
        icon: 'delete',
        color: 'error'
      });
      this.reportToDelete = null;
    }
  }
}
