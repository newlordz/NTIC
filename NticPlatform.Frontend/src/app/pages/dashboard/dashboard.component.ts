import { getAuthValue } from '../../services/session.util';
import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  ContentService,
  ApprovalRequest,
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
import { ApiService, MyEnrolledCourse, MySubmission, SponsorshipSummary, Sponsorship, PersonnelDetail, AuthoredCourse, GradingQueueItem } from '../../services/api.service';
import { CurrentUserService } from '../../services/current-user.service';
import type { PersonnelRoster, PersonnelPerson, PersonnelSummary } from '../../services/api.service';
import { TimeAgoPipe } from '../../services/time-ago.pipe';
import { WsSyncService } from '../../services/ws-sync.service';
import { LmsManagerComponent } from '../lms-manager/lms-manager.component';
import { UserManagementComponent } from '../user-management/user-management.component';
import { ApplicationPreviewModalComponent } from './application-preview-modal/application-preview-modal.component';
import { SponsorTierModalComponent } from './sponsor-tier-modal/sponsor-tier-modal.component';
import { MentorRequestModalComponent } from './mentor-request-modal/mentor-request-modal.component';
import { InstitutionDecisionModalComponent } from './institution-decision-modal/institution-decision-modal.component';
import { MentorPickerModalComponent } from './mentor-picker-modal/mentor-picker-modal.component';
import { CustomAlertModalComponent } from './custom-alert-modal/custom-alert-modal.component';
import { RecordInspectorModalComponent } from './record-inspector-modal/record-inspector-modal.component';
import { MemberProfileModalComponent } from './member-profile-modal/member-profile-modal.component';
import { InstitutionPortalModalComponent } from './institution-portal-modal/institution-portal-modal.component';

export interface SponsorInfographic {
  partnerCount: number;
  totalCommitted: number;
  totalCommittedFormatted: string;
  disbursedFunds: number;
  disbursedFundsFormatted: string;
  awaitingVerificationFormatted: string;
  awaitingVerificationCount: number;
  pendingPledges: number;
  receivedPct: number;
  sponsoredTeamsCount: number;
  studentsReached: number;
  groupsReached: number;
  totalBeneficiaries: number;
  tiers: any[];
  sectors: any[];
  hasData: boolean;
}

interface LandingCopyField { key: string; label: string; multiline?: boolean; }
interface LandingCopySection { title: string; icon: string; fields: LandingCopyField[]; }

type PersonnelRole = 'governance' | 'mentor' | 'sponsor' | 'judge' | 'instructor';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, RouterLink, FormsModule, TimeAgoPipe,
    LmsManagerComponent, UserManagementComponent,
    ApplicationPreviewModalComponent, SponsorTierModalComponent,
    MentorRequestModalComponent, InstitutionDecisionModalComponent,
    MentorPickerModalComponent, CustomAlertModalComponent,
    RecordInspectorModalComponent, MemberProfileModalComponent,
    InstitutionPortalModalComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class DashboardComponent implements OnInit, OnDestroy {
  Math = Math;
  activeRoleId = '';
  canManageUsers = false;
  dashboardTitle = 'Dashboard';
  dashboardSubtitle = 'NTIC Platform Portal';
  currentUser: any = null;

  stats: any[] = [];

  // ─── LIVE TELEMETRY ──────────────────────────
  private liveIntervals: any[] = [];
  liveTime = '';
  connectionPulse = true;

  // ── ADVANCED LIVE AUDIT TRAIL STATE ──────────────────────────
  auditSearchQuery = '';
  auditCategoryFilter: 'all' | 'auth' | 'approval' | 'content' | 'system' | 'ticket' | 'revoked' = 'all';
  auditSeverityFilter: 'all' | 'info' | 'success' | 'warning' | 'danger' = 'all';
  auditTimeFilter: 'all' | 'today' | '24h' | '7d' | '30d' = 'all';
  auditUserFilter = 'all';
  auditViewMode: 'stream' | 'table' = 'stream';
  auditAutoRefresh = true;
  auditIsRefreshing = false;
  auditPage = 1;
  auditPageSize = 12;
  auditSelectedLog: any = null;
  auditShowJsonInInspector = false;
  auditExportDropdownOpen = false;
  auditToastMessage = '';
  private auditToastTimer: any = null;
  lastAuditSyncTime: Date = new Date();

  // Memoized audit trail state for 60fps instant UI
  enrichedAuditLogs: any[] = [];
  filteredAuditLogs: any[] = [];
  paginatedAuditLogs: any[] = [];
  auditAuthCount = 0;
  auditApprovalCount = 0;
  auditContentCount = 0;
  auditSecurityCount = 0;
  auditTimelineTodayCount = 0;
  auditTimeline24hCount = 0;
  auditTimeline7dCount = 0;
  auditTimeline30dCount = 0;
  auditUniqueActors: string[] = [];
  auditTotalPages = 1;
  auditPaginationRange: number[] = [1];

  // ── ENTITY & CREDENTIAL RECORDS ARCHIVE STATE ──
  dashboardRecords: any[] = [];
  dashboardFilteredRecords: any[] = [];
  dashboardRecordsFilter: 'all' | 'approved' | 'pending' | 'rejected' = 'all';
  dashboardRecordsTypeFilter: 'all' | 'school' | 'instructor' | 'judge' | 'sponsor' | 'team' = 'all';
  dashboardRecordsSearch = '';
  dashboardSelectedRecord: any = null;
  dashboardRecordModalOpen = false;

  get dashboardTotalRecordsCount(): number {
    return this.dashboardRecords.length;
  }

  get dashboardApprovedRecordsCount(): number {
    return this.dashboardRecords.filter(r => r.status === 'approved').length;
  }

  get dashboardPendingRecordsCount(): number {
    return this.dashboardRecords.filter(r => r.status === 'pending').length;
  }

  get dashboardRejectedRecordsCount(): number {
    return this.dashboardRecords.filter(r => r.status === 'rejected').length;
  }

  // ── LMS & CURRICULUM STATE GETTERS (COMMAND CENTER) ──
  get lmsPendingApprovalsCount(): number {
    let count = 0;
    for (const c of (this.contentService.lmsCourses || [])) {
      if (c.approvalStatus === 'pending') count++;
    }
    for (const m of (this.contentService.lmsModules || [])) {
      if (m.approvalStatus === 'pending') count++;
    }
    for (const mat of (this.contentService.lmsMaterials || [])) {
      if (mat.approvalStatus === 'pending') count++;
    }
    for (const a of (this.contentService.lmsAssignments || [])) {
      if (a.approvalStatus === 'pending') count++;
    }
    return count;
  }

  get lmsTotalCourses(): number {
    return (this.contentService.lmsCourses || []).length;
  }

  get lmsActiveCoursesCount(): number {
    return (this.contentService.lmsCourses || []).filter(c => c.status === 'active' && c.approvalStatus === 'approved').length;
  }

  get lmsTotalModules(): number {
    return (this.contentService.lmsModules || []).length;
  }

  get lmsTotalMaterials(): number {
    return (this.contentService.lmsMaterials || []).length;
  }

  get lmsPendingGradingCount(): number {
    return (this.contentService.lmsSubmissions || []).filter(s => s.status === 'submitted').length;
  }

  get lmsRecentCourses(): any[] {
    return (this.contentService.lmsCourses || []).slice(0, 4);
  }

  openLmsManager(tab?: string): void {
    this.adminTab = 'lms';
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  }

  // ── COMPETITION ARENA GETTERS (COMMAND CENTER) ──
  get competitionTracksCount(): number {
    return this.trackDistribution.length;
  }

  get totalCompetitionTeamsCount(): number {
    return (this.contentService.teams || []).length;
  }

  get totalCompetitionSubmissionsCount(): number {
    return (this.contentService.submissions || []).length;
  }

  get scoredCompetitionSubmissionsCount(): number {
    const subs = this.contentService.submissions || [];
    return subs.filter(s => s.score !== null && s.score !== undefined).length;
  }

  get pendingCompetitionScoringCount(): number {
    const subs = this.contentService.submissions || [];
    return subs.filter(s => s.score === null || s.score === undefined).length;
  }

  get competitionLeaderboardTop(): any[] {
    return (this.contentService.leaderboardData || []).slice(0, 5);
  }

  openCompetitionCenter(): void {
    this.goToSubTab('content');
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  }

  openJudgePortal(): void {
    this.router.navigate(['/judge']);
  }

  // ── LIVE COMPETITION & SCORING TICKER ──
  lastScoringUpdate: Date = new Date();
  isScoringUpdated = false;
  tournamentAudioEnabled = false;
  private scoringPulseDebounceTimer: any = null;

  tournamentTickerTracks: any[] = [];

  recomputeTournamentTracks(): void {
    const list = this.contentService.competitions?.filter(c => c.status !== 'archived' && c.status !== 'draft') || [];
    this.tournamentTickerTracks = list.slice(0, 4).map((c, idx) => ({
      id: c.id || idx + 1,
      title: c.title || 'Championship Track',
      track: c.track || '',
      category: c.category || 'National Stage',
      teamsCount: c.teams || 0,
      icon: c.icon || this._trackIcon(c.track),
      badge: c.status === 'active' ? 'Scoring Open' : 'Active Heats',
      badgeClass: 'cc-tbadge-live'
    }));
  }

  trackByTournamentId(_index: number, item: any): any {
    return item.id || item.title;
  }

  trackByApprovalId(_index: number, item: any): any {
    return item?.id || _index;
  }

  toggleTournamentAudio(): void {
    this.tournamentAudioEnabled = false;
  }

  playTournamentChime(): void {
    // Permanently muted
  }

  triggerScoringUpdatePulse(): void {
    if (this.scoringPulseDebounceTimer) {
      clearTimeout(this.scoringPulseDebounceTimer);
    }
    this.scoringPulseDebounceTimer = setTimeout(() => {
      this.lastScoringUpdate = new Date();
      this.isScoringUpdated = true;
      this.playTournamentChime();
      this.cdr.markForCheck();
      setTimeout(() => {
        this.isScoringUpdated = false;
        this.cdr.markForCheck();
      }, 2500);
    }, 500);
  }

  quickApproveTopPending(): void {
    const topPending = this.contentService.pendingApprovals?.[0];
    if (topPending) {
      this.approveRequest(topPending);
      this.dialogService.toast(`Approved credentials for ${topPending.entity || topPending.id}`, 'success');
      this.loadDashboardRecords();
      this.triggerScoringUpdatePulse();
    } else {
      this.dialogService.toast('No pending credentials in queue.', 'info');
    }
  }
  trackByNodeId(_index: number, node: { id: string }): string {
    return node.id;
  }

  trackByStatLabel(_index: number, stat: { label: string }): string {
    return stat.label;
  }

  isSyncingData = false;
  private syncTimer: any = null;

  triggerSyncSpin(): void {
    this.isSyncingData = true;
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.isSyncingData = false;
      this.cdr.markForCheck();
    }, 1200);
    this.cdr.markForCheck();
  }

  refreshAllData(): void {
    this.triggerSyncSpin();
    this.loadAuthSessions();
    this.loadAuthSessionCount();
    this.loadDashboardRecords();
    this.loadAuditLogsFromBackend();
    this.loadSystemNodesHealth();
    this.loadSystemTelemetry();
    this.contentService.refreshBackendData();
    this.recomputeAuditState();
    this.dialogService.toast('Live platform telemetry & audit stream synced.', 'success');
  }

  /** Worst status across the reported components, so the header cannot claim
   *  "All Healthy" while a component is down. */
  get overallSystemStatus(): string {
    if (!this.infrastructureNodes.length) return 'Unknown';
    const states = this.infrastructureNodes.map(n => (n.status || '').toLowerCase());
    if (states.includes('down')) return 'Down';
    if (states.includes('degraded')) return 'Degraded';
    if (states.includes('not configured')) return 'Degraded';
    return 'Healthy';
  }

  get overallSystemLabel(): string {
    const total = this.infrastructureNodes.length;
    if (!total) return 'Status unavailable';
    const healthy = this.infrastructureNodes.filter(
      n => ['healthy', 'configured'].includes((n.status || '').toLowerCase())
    ).length;
    const status = this.overallSystemStatus;
    return status === 'Healthy'
      ? `All Healthy (${healthy}/${total})`
      : `${status} (${healthy}/${total} healthy)`;
  }

  /** API process uptime, from the live telemetry response (not a fixed 99.98%). */
  get coreUptimeLabel(): string {
    const s = this._telemetry?.api?.uptimeSeconds;
    return typeof s === 'number' ? this.formatUptime(s) : '--';
  }

  /** Measured database latency, from the live telemetry response. */
  get dbLatencyLabel(): string {
    const ms = this._telemetry?.database?.latencyMs;
    return typeof ms === 'number' ? `${ms}ms` : '--';
  }

  /** Connected WebSocket clients, from the live telemetry response. */
  get liveClientsLabel(): string {
    const n = this._telemetry?.realtime?.connectedClients;
    return typeof n === 'number' ? `${n}` : '--';
  }

  /** Status dot colour, driven by the server's reported state. */
  nodeDotClass(status: string): string {
    const s = (status || '').toLowerCase();
    if (s === 'healthy' || s === 'configured') return 'cc-dot-green';
    if (s === 'degraded') return 'cc-dot-amber';
    if (s === 'down') return 'cc-dot-red';
    return 'cc-dot-grey';
  }

  /**
   * Measured platform figures, populated from GET /api/system/telemetry.
   *
   * Empty until the server answers. The backend cannot observe host resources,
   * so those gauges have been removed rather than faked.
   */
  systemGauges: { label: string; value: number | string; color: string; unit: string }[] = [];
  telemetryError = '';
  private _telemetry: any = null;

  private readonly trackColors = ['#3b82f6','#10b981','#6366f1','#f59e0b','#ec4899','#8b5cf6','#14b8a6','#f97316'];
  private readonly trackIcons: Record<string, string> = {
    'coding': 'code', 'algorithm': 'code', 'software': 'code', 'web': 'code',
    'robotics': 'smart_toy', 'iot': 'smart_toy', 'hardware': 'precision_manufacturing',
    'ai': 'psychology', 'artificial': 'psychology', 'machine': 'psychology',
    'cyber': 'security', 'security': 'security', 'ctf': 'security',
    'innovation': 'lightbulb', 'open': 'lightbulb'
  };

  private _trackIcon(name: string): string {
    const lower = name.toLowerCase();
    for (const [key, icon] of Object.entries(this.trackIcons)) {
      if (lower.includes(key)) return icon;
    }
    return 'emoji_events';
  }

  get trackDistribution(): { name: string; count: number; pct: number; color: string; icon: string }[] {
    const subs = this.contentService.submissions || [];
    const comps = this.contentService.competitions || [];
    // Derive tracks from submissions first, fall back to competitions list
    const trackMap = new Map<string, number>();
    if (subs.length > 0) {
      for (const s of subs) {
        const t = (s.track || 'Unknown').trim();
        trackMap.set(t, (trackMap.get(t) || 0) + 1);
      }
    } else if (comps.length > 0) {
      for (const c of comps) {
        const t = (c.track || c.category || 'Unknown').trim();
        trackMap.set(t, (trackMap.get(t) || 0) + (c.teams || 0));
      }
    }
    if (trackMap.size === 0) return [];
    const total = Array.from(trackMap.values()).reduce((a, b) => a + b, 0) || 1;
    const sorted = Array.from(trackMap.entries()).sort((a, b) => b[1] - a[1]);
    return sorted.map(([name, count], i) => ({
      name,
      count,
      pct: Math.round((count / total) * 100),
      color: this.trackColors[i % this.trackColors.length],
      icon: this._trackIcon(name)
    }));
  }

  get regionalBreakdown(): { region: string; schools: number; pct: number; color: string; leads: number; students: number }[] {
    const teams = this.contentService.teams || [];
    const users = this.contentService.users || [];
    const regionMap = new Map<string, { schools: Set<string>; leads: number; students: number }>();
    for (const t of teams) {
      const r = (t.region || 'Unknown').trim();
      if (!regionMap.has(r)) regionMap.set(r, { schools: new Set(), leads: 0, students: 0 });
      const entry = regionMap.get(r)!;
      if (t.schoolName || t.school_name) entry.schools.add((t.schoolName || t.school_name)!);
      entry.students += (t.members || 0);
    }
    for (const u of users) {
      if (u.role === 'instructor' || u.role === 'school_admin') {
        const r = (u.region || 'Unknown').trim();
        if (!regionMap.has(r)) regionMap.set(r, { schools: new Set(), leads: 0, students: 0 });
        regionMap.get(r)!.leads++;
      }
    }
    if (regionMap.size === 0) return [];
    const sorted = Array.from(regionMap.entries()).sort((a, b) => b[1].schools.size - a[1].schools.size);
    const maxSchools = sorted[0]?.[1].schools.size || 1;
    return sorted.map(([region, data], i) => ({
      region,
      schools: data.schools.size,
      pct: Math.round((data.schools.size / maxSchools) * 100),
      color: this.trackColors[i % this.trackColors.length],
      leads: data.leads,
      students: data.students
    }));
  }

  get totalSchoolsCount(): number {
    const schools = new Set<string>();
    for (const t of (this.contentService.teams || [])) {
      const s = (t.schoolName || t.school_name || '').trim();
      if (s) schools.add(s.toLowerCase());
    }
    for (const u of (this.contentService.users || [])) {
      const anyUser = u as any;
      const s = (u.organization || anyUser.school || anyUser.schoolName || '').trim();
      if (s && s !== 'NTIC Platform' && s !== '--') schools.add(s.toLowerCase());
    }
    return schools.size;
  }

  get totalInstructorsAndMentorsCount(): number {
    return (this.contentService.users || []).filter(u => u.role === 'instructor' || u.role === 'school_admin').length;
  }

  get totalStudentsCount(): number {
    const studentUsers = (this.contentService.users || []).filter(u => u.role === 'student').length;
    const teamMembers = (this.contentService.teams || []).reduce((acc, t) => acc + (t.members || 0), 0);
    return Math.max(studentUsers, teamMembers);
  }

  get participatingRegionsCount(): number {
    const regions = new Set<string>();
    for (const t of (this.contentService.teams || [])) {
      if (t.region && t.region.trim()) regions.add(t.region.trim().toLowerCase());
    }
    for (const u of (this.contentService.users || [])) {
      if (u.region && u.region.trim()) regions.add(u.region.trim().toLowerCase());
    }
    return regions.size;
  }

  get superAdminCount(): number {
    return (this.contentService.users || []).filter(u => u.role === 'super_admin').length;
  }

  get schoolAdminCount(): number {
    return (this.contentService.users || []).filter(u => u.role === 'school_admin').length;
  }

  get publishedModulesCount(): number {
    return (this.contentService.lmsModules || []).length;
  }

  get lmsSubmissionsCount(): number {
    return (this.contentService.lmsSubmissions || []).length;
  }

  get lmsEnrollmentCount(): number {
    return (this.contentService.lmsEnrollments || []).length;
  }

  /** Count of submissions in a given track (case-insensitive keyword match). */
  trackSubmissionsCount(keyword: string): number {
    const subs = this.contentService.submissions || [];
    const k = keyword.toLowerCase();
    return subs.filter(s => (s.track || '').toLowerCase().includes(k)).length;
  }

  /** Live evaluation-queue status: either "All scored" or the pending count. */
  get evaluationQueueLabel(): string {
    const pending = this.pendingCompetitionScoringCount;
    return pending === 0 ? 'All scored' : `${pending} pending`;
  }

  /** Percentage of competition submissions that have been scored. */
  get competitionScoringPct(): number {
    const total = this.totalCompetitionSubmissionsCount;
    if (!total) return 0;
    return Math.round((this.scoredCompetitionSubmissionsCount / total) * 100);
  }

  /**
   * Component health, populated from GET /api/system/nodes-health.
   *
   * Starts empty. The previous hardcoded array claimed four "Healthy" nodes
   * -- including an LMS Storage Bucket and a Compiler VM that do not exist --
   * with invented latency, load percentages and SVG sparkline paths. Those
   * values would remain on screen during a real outage.
   */
  infrastructureNodes: {
    id: string; name: string; status: string;
    latencyMs: number | null; detail: string; measured: boolean;
  }[] = [];

  // ─── SUPER ADMIN STATE ─────────────────────────
  adminTab: 'overview' | 'control' | 'dashboard' | 'register' | 'tickets' | 'approvals' | 'content' | 'users' | 'admins' | 'lms' | 'database' = 'dashboard';
  adminSubTab: 'tickets' | 'approvals' | 'content' | 'users' | 'admins' | 'audit' | 'users_full' | 'personnel' | 'mentors' | '' = '';

  goToTab(tab: string): void {
    this.adminTab = tab as any;
    this.adminSubTab = '';
    this.persistNavState();
  }

  goToSubTab(sub: string): void {
    this.adminSubTab = sub as any;
    if (sub === 'content' && this.contentTab === 'pagecopy') {
      this.loadLandingCopyForm();
    }
    if (sub === 'personnel') {
      this.loadPersonnel();
    }
    if (sub === 'approvals') {
      this.loadApprovalsFromBackend();
    }
    this.persistNavState();
  }

  persistNavState(): void {
    try {
      const state = {
        adminTab: this.adminTab,
        adminSubTab: this.adminSubTab,
        contentTab: this.contentTab,
        cmsCategoryFilter: this.cmsCategoryFilter,
        personnelTab: this.personnelTab,
        maximizedContentTab: this.maximizedContentTab
      };
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('ntic_admin_nav_state', JSON.stringify(state));
      }
    } catch { /* ignore */ }

    // Sync query parameters without polluting history stack
    const qp: Record<string, any> = {
      tab: this.adminTab,
      subtab: this.adminSubTab || null,
      contentTab: (this.adminSubTab === 'content' || this.maximizedContentTab) ? this.contentTab : null,
      category: this.cmsCategoryFilter !== 'all' ? this.cmsCategoryFilter : null,
      personnelRole: this.adminSubTab === 'personnel' ? this.personnelTab : null
    };
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: qp,
      queryParamsHandling: 'merge',
      replaceUrl: true
    }).catch(() => {});
  }

  restoreNavStateFromStorage(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('ntic_admin_nav_state');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.adminTab && ['overview', 'control', 'dashboard', 'register', 'tickets', 'approvals', 'content', 'users', 'admins', 'lms', 'database'].includes(parsed.adminTab)) {
            this.adminTab = parsed.adminTab;
          }
          if (parsed.adminSubTab !== undefined) {
            this.adminSubTab = parsed.adminSubTab;
          }
          if (parsed.contentTab && ['stories', 'hof', 'leaderboard', 'talent', 'stats', 'news', 'countdown', 'slideshow', 'philosophy', 'events', 'pagecopy'].includes(parsed.contentTab)) {
            this.contentTab = parsed.contentTab;
          }
          if (parsed.cmsCategoryFilter) {
            this.cmsCategoryFilter = parsed.cmsCategoryFilter;
          }
          if (parsed.personnelTab) {
            this.personnelTab = parsed.personnelTab;
          }
          if (parsed.maximizedContentTab) {
            this.maximizedContentTab = parsed.maximizedContentTab;
            this.expandedSection = true;
          }
          if (this.contentTab === 'pagecopy') {
            this.loadLandingCopyForm();
          }
        }
      }
    } catch { /* ignore */ }
  }

  // ─── PERSONNEL (SPONSORS / JUDGES / INSTRUCTORS) ─────────────
  // Operational monitoring, distinct from User Management's CRUD. Everything
  // rendered here comes from GET /api/admin/personnel, which only reports what
  // the database can prove. Role detail the old UI implied for these people
  // (judge expertise, sponsor tier/payments, instructor portfolio) has no
  // column in `users` and is intentionally not shown.
  personnelTab: PersonnelRole = 'governance';
  personnelRoster: PersonnelRoster | null = null;
  personnelLoading = false;
  personnelError = '';
  personnelSearch = '';
  personnelFilter: 'all' | 'online' | 'attention' | 'dormant' = 'all';
  selectedPerson: PersonnelPerson | null = null;
  /** Full record for the open drawer, from GET /api/admin/personnel/{id}. */
  personDetail: PersonnelDetail | null = null;
  personDetailLoading = false;
  /** In-flight management action, keyed by user id, so buttons can disable. */
  personActionBusy: Record<string, boolean> = {};
  personActionError = '';
  personActionNotice = '';

  readonly personnelTabs: { id: PersonnelRole; label: string; icon: string }[] = [
    { id: 'governance', label: 'Governance', icon: 'admin_panel_settings' },
    { id: 'mentor', label: 'Mentors', icon: 'psychology' },
    { id: 'sponsor', label: 'Sponsors', icon: 'handshake' },
    { id: 'judge', label: 'Judges', icon: 'gavel' },
    { id: 'instructor', label: 'Instructors', icon: 'badge' },
  ];

  loadPersonnel(showFeedback = false): void {
    if (this.personnelLoading) return;
    this.personnelLoading = true;
    this.personnelError = '';
    this.apiService.getPersonnel().subscribe({
      next: roster => {
        this.personnelRoster = roster;
        this.personnelLoading = false;
        if (showFeedback) {
          this.dialogService.toast('Personnel roster refreshed from database.', 'success');
        }
        this.cdr.detectChanges();
      },
      error: err => {
        this.personnelLoading = false;
        // Say which failure this is. A 403 is a permissions problem, not an
        // outage, and reporting "could not load" for both wastes time.
        this.personnelError = err?.status === 403
          ? 'Your role cannot view the personnel roster. Administrator access is required.'
          : err?.status === 401
            ? 'Your session expired. Sign in again to view the roster.'
            : 'Could not reach the server to load the personnel roster.';
        if (showFeedback) {
          this.dialogService.toast(this.personnelError, 'error');
        }
        this.cdr.detectChanges();
      },
    });
  }

  setPersonnelTab(tab: PersonnelRole): void {
    this.personnelTab = tab;
    this.selectedPerson = null;
    this.personDetail = null;
    this.personnelSearch = '';
    this.personnelFilter = 'all';
    this.persistNavState();
  }

  /** Opens the drawer and loads the person's full record. */
  openPerson(person: PersonnelPerson): void {
    this.selectedPerson = person;
    this.personDetail = null;
    this.personActionError = '';
    this.personActionNotice = '';
    this.personDetailLoading = true;
    this.apiService.getPersonnelDetail(person.id).subscribe({
      next: detail => {
        this.personDetail = detail;
        this.personDetailLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.personDetailLoading = false;
        this.personActionError = 'Could not load the full record for this person.';
        this.cdr.detectChanges();
      },
    });
  }

  closePerson(): void {
    this.selectedPerson = null;
    this.personDetail = null;
    this.personActionError = '';
    this.personActionNotice = '';
  }

  // ── Management actions ─────────────────────────────────────────────
  // The monitor was read-only: an administrator could see that somebody needed
  // attention but had to leave for User Management to do anything, and had no way
  // at all to end a session or force a password rotation.

  async setPersonStatus(person: PersonnelPerson, status: 'Active' | 'Suspended' | 'Inactive'): Promise<void> {
    if (this.personActionBusy[person.id]) return;

    if (status !== 'Active') {
      const ok = await this.dialogService.confirm({
        title: status === 'Suspended' ? 'Suspend this account?' : 'Deactivate this account?',
        message: `${person.full_name || person.email} will be signed out of every device `
          + `immediately and will not be able to sign in again until reactivated.`,
        confirmText: status === 'Suspended' ? 'Suspend' : 'Deactivate',
        type: 'danger',
      });
      if (!ok) return;
    }

    this.personActionBusy[person.id] = true;
    this.personActionError = '';
    this.personActionNotice = '';
    this.apiService.setPersonnelStatus(person.id, status).subscribe({
      next: res => {
        this.personActionBusy[person.id] = false;
        this.personActionNotice = status === 'Active'
          ? `${person.full_name || person.email} reactivated.`
          : `${person.full_name || person.email} set to ${status}`
            + (res.sessions_revoked ? `; ${res.sessions_revoked} session(s) ended.` : '.');
        this.loadPersonnel();
      },
      error: err => {
        this.personActionBusy[person.id] = false;
        this.personActionError = err?.status === 409
          ? (err?.error?.detail || 'You cannot change your own account status.')
          : err?.status === 403
            ? 'Administrator access is required for this action.'
            : 'Could not apply the change. Nothing was altered.';
        this.cdr.detectChanges();
      },
    });
  }

  async forcePasswordChange(person: PersonnelPerson): Promise<void> {
    if (this.personActionBusy[person.id]) return;
    const ok = await this.dialogService.confirm({
      title: 'Require a new password?',
      message: `${person.full_name || person.email} will be signed out now and must set a `
        + `new password the next time they sign in.`,
      confirmText: 'Require change',
      type: 'warning',
    });
    if (!ok) return;

    this.personActionBusy[person.id] = true;
    this.personActionError = '';
    this.apiService.requirePasswordChange(person.id).subscribe({
      next: res => {
        this.personActionBusy[person.id] = false;
        this.personActionNotice = `${person.full_name || person.email} must change their password`
          + (res.sessions_revoked ? `; ${res.sessions_revoked} session(s) ended.` : '.');
        this.loadPersonnel();
      },
      error: () => {
        this.personActionBusy[person.id] = false;
        this.personActionError = 'Could not require a password change.';
        this.cdr.detectChanges();
      },
    });
  }

  async revokeSessions(person: PersonnelPerson): Promise<void> {
    if (this.personActionBusy[person.id]) return;
    const ok = await this.dialogService.confirm({
      title: 'Sign out everywhere?',
      message: `${person.full_name || person.email} will be signed out of every device. `
        + `Their account stays active and they can sign back in.`,
      confirmText: 'Sign out',
      type: 'warning',
    });
    if (!ok) return;

    this.personActionBusy[person.id] = true;
    this.personActionError = '';
    this.apiService.revokePersonnelSessions(person.id).subscribe({
      next: res => {
        this.personActionBusy[person.id] = false;
        this.personActionNotice = res.sessions_revoked
          ? `${res.sessions_revoked} session(s) ended.`
          : 'That person had no active sessions.';
        this.loadPersonnel();
      },
      error: () => {
        this.personActionBusy[person.id] = false;
        this.personActionError = 'Could not end their sessions.';
        this.cdr.detectChanges();
      },
    });
  }

  /** Everyone in the active role tab, before search/filter. */
  get personnelInTab(): PersonnelPerson[] {
    if (!this.personnelRoster?.people) return [];
    if (this.personnelTab === 'governance') {
      const govRoles = ['super_admin', 'admin', 'support_admin', 'content_manager', 'competition_manager', 'reviewer', 'school_admin', 'governance'];
      return this.personnelRoster.people.filter(p => govRoles.includes(p.role));
    }
    if (this.personnelTab === 'mentor') {
      return this.personnelRoster.people.filter(p => p.role === 'mentor' || p.role === 'lead_mentor');
    }
    return this.personnelRoster.people.filter(p => p.role === this.personnelTab);
  }

  get personnelList(): PersonnelPerson[] {
    const term = this.personnelSearch.trim().toLowerCase();
    return this.personnelInTab.filter(p => {
      if (term) {
        const haystack = `${p.full_name} ${p.email} ${p.organization} ${p.ticket} ${p.role}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      switch (this.personnelFilter) {
        case 'online':    return p.is_online;
        case 'attention': return this.personNeedsAttention(p);
        case 'dormant':   return !p.last_login_at;
        default:          return true;
      }
    });
  }

  get personnelSummary(): PersonnelSummary | null {
    return this.personnelRoster?.summary?.[this.personnelTab] || null;
  }

  personnelTabCount(role: PersonnelRole): number {
    return this.personnelRoster?.summary?.[role]?.total ?? 0;
  }

  formatGovernanceRole(role: string): string {
    const map: Record<string, string> = {
      super_admin: 'Super Admin',
      admin: 'Administrator',
      support_admin: 'Support Admin',
      content_manager: 'Content Manager',
      competition_manager: 'Competition Manager',
      reviewer: 'Reviewer / Auditor',
      school_admin: 'School Lead / Admin',
      mentor: 'Mentor',
      lead_mentor: 'Lead Mentor'
    };
    return map[role] || (role ? role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Governance');
  }

  /** Card badge. Read from the already-loaded user list so the count is real
   *  before the roster endpoint has been called. */
  get personnelCount(): number {
    return this.contentService.users.filter(u =>
      ['super_admin', 'admin', 'support_admin', 'content_manager', 'competition_manager', 'reviewer', 'school_admin', 'mentor', 'sponsor', 'judge', 'instructor'].includes((u as any).role)
    ).length;
  }

  personNeedsAttention(p: PersonnelPerson): boolean {
    return (p.status || '').toLowerCase() !== 'active' || p.must_change_password;
  }

  /** Human "last seen". Distinguishes never-logged-in from simply idle -- those
   *  mean very different things when you are chasing an inactive sponsor. */
  personLastSeen(p: PersonnelPerson): string {
    if (p.is_online) return 'Online now';
    if (!p.last_login_at) return 'Never signed in';
    const then = new Date(p.last_login_at).getTime();
    if (isNaN(then)) return 'Unknown';
    const mins = Math.floor((Date.now() - then) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(p.last_login_at).toLocaleDateString();
  }

  /** Instructor course figures are null for other roles by design. */
  personCourseLabel(p: PersonnelPerson): string {
    if (p.courses_authored === null) return 'n/a';
    if (p.courses_authored === 0) return 'None yet';
    const pending = p.courses_pending ? ` (${p.courses_pending} pending)` : '';
    return `${p.courses_authored}${pending}`;
  }

  /** Template entry points. These now load the person's full record rather than
   *  just stashing the roster row, so the drawer can show their courses, pledges,
   *  enrolments or grading history. */
  openPersonDetail(p: PersonnelPerson): void {
    this.openPerson(p);
  }

  closePersonDetail(): void {
    this.closePerson();
  }

  /** Jump to User Management for the things this panel deliberately does not do --
   *  changing a role, editing identity fields, or deleting an account. Status,
   *  password rotation and session revocation are handled here directly. */
  managePersonInUserAdmin(): void {
    this.selectedPerson = null;
    this.goToSubTab('users_full');
  }

  copyText(text: string, label: string = 'Copied'): void {
    if (!text) return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.dialogService.toast(`${label}: ${text}`, 'info');
      }).catch(() => {
        this.fallbackCopyText(text);
        this.dialogService.toast(`${label}: ${text}`, 'info');
      });
    } else {
      this.fallbackCopyText(text);
      this.dialogService.toast(`${label}: ${text}`, 'info');
    }
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

  private emailValidationTimer: any = null;
  private phoneValidationTimer: any = null;

  clearValidation(): void {
    this.emailValid = null;
    this.emailMessage = '';
    this.phoneValid = null;
    this.phoneMessage = '';
    this.regError = '';
  }

  generatePreviewTicket(): void {
    this.regPreviewTicket = this.randomSuffix(4);
  }

  validateEmail(): void {
    clearTimeout(this.emailValidationTimer);
    const email = (this.regForm.email || '').trim().toLowerCase();
    if (!email) {
      this.emailValid = null;
      this.emailMessage = '';
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      this.emailValid = false;
      this.emailMessage = 'Invalid email format';
      this.regError = 'Please enter a valid email address.';
      return;
    }
    this.emailValidationTimer = setTimeout(() => {
      this.apiService.checkAvailability(email, '').subscribe({
        next: (res) => {
          if (res && res.email_taken) {
            this.emailValid = false;
            this.emailMessage = 'Email already registered';
            this.regError = `Email "${email}" is already registered.`;
          } else {
            this.emailValid = true;
            this.emailMessage = '';
            if (this.regError.includes('email') || this.regError.includes('Email')) {
              this.regError = '';
            }
          }
        },
        error: () => {
          this.emailValid = true;
          this.emailMessage = '';
        }
      });
    }, 350);
  }

  validatePhone(): void {
    clearTimeout(this.phoneValidationTimer);
    const phone = (this.regForm.phone || '').trim();
    if (!phone) {
      this.phoneValid = null;
      this.phoneMessage = '';
      return;
    }
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8) {
      this.phoneValid = false;
      this.phoneMessage = 'Invalid phone number (8-15 digits)';
      this.regError = 'Phone number is too short.';
      return;
    }
    this.phoneValidationTimer = setTimeout(() => {
      this.apiService.checkAvailability('', phone).subscribe({
        next: (res) => {
          if (res && res.phone_taken) {
            this.phoneValid = false;
            this.phoneMessage = 'Phone number already registered';
            this.regError = `Phone number "${phone}" is already registered.`;
          } else {
            this.phoneValid = true;
            this.phoneMessage = '';
            if (this.regError.includes('phone') || this.regError.includes('Phone')) {
              this.regError = '';
            }
          }
        },
        error: () => {
          this.phoneValid = true;
          this.phoneMessage = '';
        }
      });
    }, 350);
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
    memberCredentials?: { name: string; email: string; ticket: string; temporary_password: string }[];
    copiedPass: boolean;
    copiedPin: boolean;
    copiedAll: boolean;
    copiedMembers?: boolean;
  } | null = null;

  customAlertModal: {
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'warning' | 'info' | 'error';
  } | null = null;

  openCredentialsModal(title: string, subtitle: string, accessPass: string, pin: string, extraInfo?: string, nextRoute?: string, memberCredentials?: { name: string; email: string; ticket: string; temporary_password: string }[]) {
    this.credentialsModal = {
      isOpen: true,
      title,
      subtitle,
      accessPass,
      pin,
      extraInfo,
      nextRoute,
      memberCredentials,
      copiedPass: false,
      copiedPin: false,
      copiedAll: false,
      copiedMembers: false
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
      const pinPart = this.credentialsModal.pin ? `\nPIN / OTP: ${this.credentialsModal.pin}` : '';
      textToCopy = `Access Pass: ${this.credentialsModal.accessPass}${pinPart}`;
      this.credentialsModal.copiedAll = true;
      setTimeout(() => { if (this.credentialsModal) this.credentialsModal.copiedAll = false; }, 2500);
    }
    if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(textToCopy).catch(() => {
        try {
          const ta = document.createElement('textarea');
          ta.value = textToCopy;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        } catch {}
      });
    }
  }

  copyMemberCredentials() {
    if (!this.credentialsModal?.memberCredentials?.length) return;
    const lines = (this.credentialsModal?.memberCredentials || [])
      .map(m => {
        const name = m.name || m.email || 'Member';
        const otp = m.temporary_password || '';
        const ticket = m.ticket || '';
        return `${name} | ${m.email || ''} | Pass: ${ticket} | OTP: ${otp}`;
      })
      .join('\n');
    if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(lines).catch(() => {
        try {
          const ta = document.createElement('textarea');
          ta.value = lines;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        } catch {}
      });
    }
    this.credentialsModal.copiedMembers = true;
    this.dialogService.toast('All member logins copied to clipboard', 'success');
    this.cdr?.markForCheck?.();
    setTimeout(() => {
      if (this.credentialsModal) {
        this.credentialsModal.copiedMembers = false;
        this.cdr?.markForCheck?.();
      }
    }, 2500);
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
  accessPassSearchQuery = '';
  isAccessSearchFocused = false;
  editingUserId: string | null = null;
  deleteUserConfirm: any = null;

  onAccessSearchBlur(): void {
    setTimeout(() => {
      this.isAccessSearchFocused = false;
    }, 200);
  }

  // ─── CONTENT MANAGER STATE ──────────────────────
  contentTab: 'stories' | 'hof' | 'leaderboard' | 'talent' | 'stats' | 'news' | 'countdown' | 'slideshow' | 'philosophy' | 'events' | 'pagecopy' = 'stories';
  maximizedContentTab: string | null = null;
  cmsCategoryFilter: 'all' | 'landing' | 'competitions' | 'broadcast' = 'all';
  cmsSearchQuery: string = '';

  // Dedicated search queries per panel
  storySearchQuery: string = '';
  hofSearchQuery: string = '';
  lbSearchQuery: string = '';
  tdSearchQuery: string = '';
  newsSearchQuery: string = '';
  eventsSearchQuery: string = '';

  // ── Landing Page Copy editor ──────────────────────────────────
  landingCopySections: LandingCopySection[] = [
    {
      title: 'Hero Banner & Global CTAs', icon: 'view_carousel',
      fields: [
        { key: 'hero.defaultCtaText', label: 'Primary CTA Button (e.g. Enter Portal)' },
        { key: 'hero.defaultCtaLink', label: 'Primary CTA Link (e.g. #portal)' },
        { key: 'hero.applyBtn', label: 'Secondary CTA Button (e.g. Apply Now)' },
        { key: 'hero.applyLink', label: 'Secondary CTA Link (e.g. /registration)' },
      ],
    },
    {
      title: 'Header & Navigation', icon: 'view_headline',
      fields: [
        { key: 'header.brandName', label: 'Brand Name' },
        { key: 'header.brandSub', label: 'Brand Subtitle' },
        { key: 'header.navCompetition', label: 'Nav — Competition' },
        { key: 'header.navConcept', label: 'Nav — Concept' },
        { key: 'header.navTracks', label: 'Nav — Track Arenas' },
        { key: 'header.navLogin', label: 'Nav — Login' },
        { key: 'header.applyNow', label: 'Apply Now Button' },
      ],
    },
    {
      title: 'Mega Menu', icon: 'menu',
      fields: [
        { key: 'menu.title', label: 'Menu Heading' },
        { key: 'menu.intro', label: 'Menu Intro', multiline: true },
        { key: 'menu.allTracks', label: 'All Tracks Link' },
        { key: 'menu.coding.name', label: 'Coding — Name' },
        { key: 'menu.coding.desc', label: 'Coding — Description' },
        { key: 'menu.robotics.name', label: 'Robotics — Name' },
        { key: 'menu.robotics.desc', label: 'Robotics — Description' },
        { key: 'menu.ai.name', label: 'AI — Name' },
        { key: 'menu.ai.desc', label: 'AI — Description' },
        { key: 'menu.cyber.name', label: 'Cyber — Name' },
        { key: 'menu.cyber.desc', label: 'Cyber — Description' },
        { key: 'menu.innovation.name', label: 'Innovation — Name' },
        { key: 'menu.innovation.desc', label: 'Innovation — Description' },
      ],
    },
    {
      title: 'Why We Exist', icon: 'menu_book',
      fields: [
        { key: 'about.sub', label: 'Section Eyebrow' },
        { key: 'about.heading1', label: 'Heading Word 1' },
        { key: 'about.heading2', label: 'Heading Word 2' },
        { key: 'about.heading3', label: 'Heading Word 3' },
        { key: 'about.lead', label: 'Intro Paragraph', multiline: true },
        { key: 'about.card1.title', label: 'Card 1 — Title' },
        { key: 'about.card1.body', label: 'Card 1 — Body', multiline: true },
        { key: 'about.card1.link', label: 'Card 1 — Link' },
        { key: 'about.card2.badge', label: 'Card 2 — Badge' },
        { key: 'about.card2.title', label: 'Card 2 — Title' },
        { key: 'about.card2.body', label: 'Card 2 — Body', multiline: true },
        { key: 'about.card2.link', label: 'Card 2 — Link' },
        { key: 'about.card3.title', label: 'Card 3 — Title' },
        { key: 'about.card3.body', label: 'Card 3 — Body', multiline: true },
        { key: 'about.card3.link', label: 'Card 3 — Link' },
      ],
    },
    {
      title: 'News & Events', icon: 'newspaper',
      fields: [
        { key: 'news.badge', label: 'Badge' },
        { key: 'news.viewAll', label: 'View All Link' },
        { key: 'news.heading1', label: 'Heading Word 1' },
        { key: 'news.heading2', label: 'Heading Word 2' },
        { key: 'news.heading3', label: 'Heading Word 3' },
        { key: 'news.desc', label: 'Description', multiline: true },
      ],
    },
    {
      title: 'Upcoming Competitions', icon: 'timer',
      fields: [
        { key: 'countdown.badge', label: 'Countdown Badge' },
        { key: 'countdown.desc', label: 'Countdown Description', multiline: true },
      ],
    },
    {
      title: 'Core Philosophy', icon: 'lightbulb',
      fields: [
        { key: 'philosophy.sub', label: 'Section Eyebrow' },
        { key: 'philosophy.heading', label: 'Headline Motto' },
        { key: 'philosophy.desc', label: 'Description', multiline: true },
      ],
    },
    {
      title: 'Hall of Fame', icon: 'workspace_premium',
      fields: [
        { key: 'hof.sub', label: 'Section Eyebrow' },
        { key: 'hof.heading', label: 'Heading' },
      ],
    },
    {
      title: 'Competition Tracks', icon: 'category',
      fields: [
        { key: 'tracks.sub', label: 'Section Eyebrow' },
        { key: 'tracks.heading', label: 'Heading' },
        { key: 'tracks.lead', label: 'Intro Paragraph', multiline: true },
        { key: 'tracks.coding.title', label: 'Coding — Title' },
        { key: 'tracks.coding.body', label: 'Coding — Body', multiline: true },
        { key: 'tracks.coding.b1', label: 'Coding — Bullet 1' },
        { key: 'tracks.coding.b2', label: 'Coding — Bullet 2' },
        { key: 'tracks.coding.b3', label: 'Coding — Bullet 3' },
        { key: 'tracks.robotics.title', label: 'Robotics — Title' },
        { key: 'tracks.robotics.body', label: 'Robotics — Body', multiline: true },
        { key: 'tracks.robotics.b1', label: 'Robotics — Bullet 1' },
        { key: 'tracks.robotics.b2', label: 'Robotics — Bullet 2' },
        { key: 'tracks.robotics.b3', label: 'Robotics — Bullet 3' },
        { key: 'tracks.ai.title', label: 'AI — Title' },
        { key: 'tracks.ai.body', label: 'AI — Body', multiline: true },
        { key: 'tracks.ai.b1', label: 'AI — Bullet 1' },
        { key: 'tracks.ai.b2', label: 'AI — Bullet 2' },
        { key: 'tracks.ai.b3', label: 'AI — Bullet 3' },
        { key: 'tracks.cyber.title', label: 'Cyber — Title' },
        { key: 'tracks.cyber.body', label: 'Cyber — Body', multiline: true },
        { key: 'tracks.cyber.b1', label: 'Cyber — Bullet 1' },
        { key: 'tracks.cyber.b2', label: 'Cyber — Bullet 2' },
        { key: 'tracks.cyber.b3', label: 'Cyber — Bullet 3' },
        { key: 'tracks.innovation.title', label: 'Innovation — Title' },
        { key: 'tracks.innovation.body', label: 'Innovation — Body', multiline: true },
        { key: 'tracks.innovation.b1', label: 'Innovation — Bullet 1' },
        { key: 'tracks.innovation.b2', label: 'Innovation — Bullet 2' },
        { key: 'tracks.innovation.b3', label: 'Innovation — Bullet 3' },
        { key: 'tracks.previewCta', label: 'Card CTA Label' },
      ],
    },
    {
      title: 'Coding Challenge', icon: 'code_blocks',
      fields: [
        { key: 'challenge.sub', label: 'Section Eyebrow' },
        { key: 'challenge.heading', label: 'Heading' },
        { key: 'challenge.desc', label: 'Description', multiline: true },
      ],
    },
    {
      title: 'Leaderboard', icon: 'leaderboard',
      fields: [
        { key: 'leaderboard.sub', label: 'Section Eyebrow' },
        { key: 'leaderboard.heading', label: 'Heading' },
        { key: 'leaderboard.desc', label: 'Description', multiline: true },
        { key: 'leaderboard.tabAll', label: 'Tab — All Heats' },
        { key: 'leaderboard.tabCoding', label: 'Tab — Coding' },
        { key: 'leaderboard.tabRobotics', label: 'Tab — Robotics' },
        { key: 'leaderboard.tabAi', label: 'Tab — AI' },
        { key: 'leaderboard.tabCyber', label: 'Tab — Cyber' },
        { key: 'leaderboard.status', label: 'Status Line' },
        { key: 'leaderboard.viewFull', label: 'View Full Button' },
      ],
    },
    {
      title: 'Impact Stats', icon: 'analytics',
      fields: [
        { key: 'stats.hub', label: 'Center Hub Label' },
        { key: 'stats.hubSub', label: 'Center Hub Sublabel' },
        { key: 'stats.regions', label: 'Regions Node Title' },
        { key: 'stats.mentors', label: 'Mentors Node Title' },
        { key: 'stats.schools', label: 'Schools Node Title' },
        { key: 'stats.students', label: 'Students Node Title' },
        { key: 'stats.projects', label: 'Projects Node Title' },
        { key: 'stats.grants', label: 'Grants Node Title' },
      ],
    },
    {
      title: 'Region Map', icon: 'map',
      fields: [
        { key: 'map.sub', label: 'Section Eyebrow' },
        { key: 'map.heading', label: 'Heading' },
        { key: 'map.lead', label: 'Intro Paragraph', multiline: true },
      ],
    },
    {
      title: 'Support a Champion', icon: 'volunteer_activism',
      fields: [
        { key: 'support.sub', label: 'Section Eyebrow' },
        { key: 'support.heading', label: 'Heading' },
        { key: 'support.lead', label: 'Intro Paragraph', multiline: true },
        { key: 'support.card1.title', label: 'Card 1 — Title' },
        { key: 'support.card1.body', label: 'Card 1 — Body', multiline: true },
        { key: 'support.card1.link', label: 'Card 1 — Link' },
        { key: 'support.card2.title', label: 'Card 2 — Title' },
        { key: 'support.card2.body', label: 'Card 2 — Body', multiline: true },
        { key: 'support.card2.link', label: 'Card 2 — Link' },
        { key: 'support.card3.title', label: 'Card 3 — Title' },
        { key: 'support.card3.body', label: 'Card 3 — Body', multiline: true },
        { key: 'support.card3.link', label: 'Card 3 — Link' },
        { key: 'support.card4.title', label: 'Card 4 — Title' },
        { key: 'support.card4.body', label: 'Card 4 — Body', multiline: true },
        { key: 'support.card4.link', label: 'Card 4 — Link' },
      ],
    },
    {
      // The partner WALL itself is data, not copy: it comes from GET /api/partners
      // and lists only sponsorships an administrator has confirmed. Only the
      // surrounding wording is editable, and until now even these headings were
      // hardcoded in landing.component.html with no way to change them.
      title: 'Partner Ecosystem', icon: 'handshake',
      fields: [
        { key: 'partners.eyebrow', label: 'Section Eyebrow' },
        { key: 'partners.heading', label: 'Heading', multiline: true },
        { key: 'partners.cta', label: 'Call-to-action Button' },
        { key: 'partners.empty', label: 'Text shown when no partners are confirmed', multiline: true },
      ],
    },
    {
      title: 'Championship Gateway', icon: 'login',
      fields: [
        { key: 'gateway.backHome', label: 'Back Link — Return to Homepage' },
        { key: 'gateway.accountLogin', label: 'Top Action — Account Login' },
        { key: 'gateway.brandName', label: 'Brand Name' },
        { key: 'gateway.brandSub', label: 'Brand Subtitle' },
        { key: 'gateway.sub', label: 'Section Eyebrow' },
        { key: 'gateway.heading', label: 'Heading' },
        { key: 'gateway.lead', label: 'Intro Paragraph', multiline: true },
        { key: 'gateway.card1.title', label: 'Card 1 (New Registration) — Title' },
        { key: 'gateway.card1.body', label: 'Card 1 — Body', multiline: true },
        { key: 'gateway.card1.f1', label: 'Card 1 — Feature 1' },
        { key: 'gateway.card1.f2', label: 'Card 1 — Feature 2' },
        { key: 'gateway.card1.f3', label: 'Card 1 — Feature 3' },
        { key: 'gateway.card1.btn', label: 'Card 1 — Button' },
        { key: 'gateway.card2.title', label: 'Card 2 (Resume) — Title' },
        { key: 'gateway.card2.body', label: 'Card 2 — Body', multiline: true },
        { key: 'gateway.card2.f1', label: 'Card 2 — Feature 1' },
        { key: 'gateway.card2.f2', label: 'Card 2 — Feature 2' },
        { key: 'gateway.card2.f3', label: 'Card 2 — Feature 3' },
        { key: 'gateway.card2.btnResume', label: 'Card 2 — Resume Button' },
        { key: 'gateway.card2.btnTrack', label: 'Card 2 — Track / Edit Button' },
      ],
    },
    {
      title: 'Loading Screen', icon: 'progress_activity',
      fields: [
        { key: 'splash.wordmark', label: 'Loading Screen Title' },
        { key: 'splash.status', label: 'Loading Screen Status Text' },
      ],
    },
    {
      title: 'Footer', icon: 'copyright',
      fields: [
        { key: 'footer.heading', label: 'Heading' },
        { key: 'footer.sub', label: 'Subtitle' },
        { key: 'footer.brief', label: 'Brief Paragraph', multiline: true },
        { key: 'footer.contact', label: 'Contact Line' },
        { key: 'footer.hotline', label: 'Hotline Line' },
        { key: 'footer.col1.title', label: 'Column 1 Title' },
        { key: 'footer.col2.title', label: 'Column 2 Title' },
        { key: 'footer.col3.title', label: 'Column 3 Title' },
        { key: 'footer.copyright', label: 'Copyright Line' },
      ],
    },
  ];

  landingCopyForm: Record<string, string> = {};
  landingCopySaveState: 'idle' | 'saving' | 'saved' | 'error' = 'idle';
  landingCopyLastSaved: string = '';
  landingCopySavingSection: string | null = null;
  landingCopySearchQuery: string = '';
  landingCopyFilterType: 'all' | 'buttons' | 'headings' | 'descriptions' = 'all';
  filteredLandingCopySections: { section: LandingCopySection; fields: LandingCopyField[] }[] = [];
  totalMatchingCopyFieldsCount: number = 0;

  trackBySectionTitle(_index: number, item: { section: LandingCopySection }): string {
    return item.section.title;
  }

  trackByFieldKey(_index: number, field: LandingCopyField): string {
    return field.key;
  }

  setLandingCopyFilter(type: 'all' | 'buttons' | 'headings' | 'descriptions'): void {
    this.landingCopyFilterType = type;
    this.updateLandingCopyFilter();
  }

  clearLandingCopySearch(): void {
    this.landingCopySearchQuery = '';
    this.landingCopyFilterType = 'all';
    this.updateLandingCopyFilter();
  }

  updateLandingCopyFilter(): void {
    const q = (this.landingCopySearchQuery || '').trim().toLowerCase();
    const filter = this.landingCopyFilterType;

    const results: { section: LandingCopySection; fields: LandingCopyField[] }[] = [];

    for (const section of this.landingCopySections) {
      const sectionTitleMatches = !q || section.title.toLowerCase().includes(q);

      const matchingFields = section.fields.filter(field => {
        // Quick Category Filter
        if (filter === 'buttons') {
          const l = field.label.toLowerCase();
          const k = field.key.toLowerCase();
          if (!l.includes('button') && !l.includes('link') && !l.includes('cta') && !l.includes('apply') && !k.includes('link') && !k.includes('cta') && !k.includes('btn') && !k.includes('viewall') && !k.includes('viewfull')) {
            return false;
          }
        } else if (filter === 'headings') {
          const l = field.label.toLowerCase();
          if (!l.includes('heading') && !l.includes('title') && !l.includes('eyebrow') && !l.includes('badge') && !l.includes('motto') && !l.includes('sub') && !l.includes('name')) {
            return false;
          }
        } else if (filter === 'descriptions') {
          const l = field.label.toLowerCase();
          if (!field.multiline && !l.includes('desc') && !l.includes('body') && !l.includes('lead') && !l.includes('intro') && !l.includes('paragraph') && !l.includes('bullet') && !l.includes('b1') && !l.includes('b2') && !l.includes('b3') && !l.includes('brief')) {
            return false;
          }
        }

        if (!q) return true;

        const labelMatch = field.label.toLowerCase().includes(q);
        const keyMatch = field.key.toLowerCase().includes(q);
        const valMatch = (this.landingCopyForm[field.key] || '').toLowerCase().includes(q);

        return sectionTitleMatches || labelMatch || keyMatch || valMatch;
      });

      if (matchingFields.length > 0) {
        results.push({ section, fields: matchingFields });
      }
    }

    this.filteredLandingCopySections = results;
    this.totalMatchingCopyFieldsCount = results.reduce((sum, item) => sum + item.fields.length, 0);
  }

  setContentTab(tab: 'stories' | 'hof' | 'leaderboard' | 'talent' | 'stats' | 'news' | 'countdown' | 'slideshow' | 'philosophy' | 'events' | 'pagecopy', updateUrl = true): void {
    this.contentTab = tab;
    if (tab === 'pagecopy') {
      this.loadLandingCopyForm();
    }
    if (updateUrl) {
      this.persistNavState();
    }
  }

  showPageCopy(): void {
    this.setContentTab('pagecopy');
  }

  isReloadingCopy = false;

  reloadLandingCopy(): void {
    this.isReloadingCopy = true;
    this.apiService.getLandingCopy().subscribe({
      next: (copy: Record<string, string>) => {
        if (copy && Object.keys(copy).length > 0) {
          this.contentService.updateLandingCopy(copy);
        }
        this.loadLandingCopyForm();
        this.isReloadingCopy = false;
        this.dialogService.toast('Landing page copy reloaded from server!', 'success');
      },
      error: (err) => {
        console.error('Failed to reload landing copy from server:', err);
        this.loadLandingCopyForm();
        this.isReloadingCopy = false;
        this.dialogService.toast('Could not reach server. Loaded local copy.', 'warning');
      }
    });
  }

  loadLandingCopyForm(): void {
    const form: Record<string, string> = {};
    for (const section of this.landingCopySections) {
      for (const field of section.fields) {
        const current = this.contentService.landingCopy?.[field.key];
        form[field.key] = current !== undefined && current !== null ? current : '';
      }
    }
    this.landingCopyForm = form;
    this.landingCopySaveState = 'idle';
    this.updateLandingCopyFilter();
  }

  resetLandingCopyForm(): void {
    const form: Record<string, string> = {};
    for (const section of this.landingCopySections) {
      for (const field of section.fields) {
        form[field.key] = '';
      }
    }
    this.landingCopyForm = form;
    this.landingCopySaveState = 'idle';
    this.updateLandingCopyFilter();
  }

  saveLandingCopy(): void {
    this.landingCopySaveState = 'saving';
    this.apiService.saveLandingCopy(this.landingCopyForm).subscribe({
      next: () => {
        this.contentService.updateLandingCopy(this.landingCopyForm);
        this.landingCopySaveState = 'saved';
        this.landingCopyLastSaved = new Date().toLocaleTimeString();
        this.dialogService.toast('Landing page copy published successfully!', 'success');
        this.addAuditLog({ action: 'Landing page copy updated', user: 'admin@ntic.org.gh', time: new Date().toISOString(), type: 'content' });
        setTimeout(() => { if (this.landingCopySaveState === 'saved') this.landingCopySaveState = 'idle'; }, 3000);
      },
      error: (err) => {
        console.error('Failed to save landing copy:', err);
        this.landingCopySaveState = 'error';
        this.dialogService.toast('Failed to publish landing copy.', 'error');
      }
    });
  }

  saveLandingCopySection(section: LandingCopySection): void {
    const payload: Record<string, string> = {};
    for (const field of section.fields) {
      payload[field.key] = this.landingCopyForm[field.key] ?? '';
    }
    this.landingCopySavingSection = section.title;
    this.apiService.saveLandingCopy(payload).subscribe({
      next: () => {
        this.contentService.updateLandingCopy(payload);
        this.landingCopySavingSection = null;
        this.landingCopyLastSaved = new Date().toLocaleTimeString();
        this.dialogService.toast(`"${section.title}" saved successfully!`, 'success');
        this.addAuditLog({ action: `Landing page copy section updated: ${section.title}`, user: 'admin@ntic.org.gh', time: new Date().toISOString(), type: 'content' });
      },
      error: (err) => {
        console.error(`Failed to save landing copy section ${section.title}:`, err);
        this.landingCopySavingSection = null;
        this.dialogService.toast(`Failed to save "${section.title}".`, 'error');
      }
    });
  }

  isSplashPreviewActive = false;

  previewSplash(): void {
    this.isSplashPreviewActive = true;
  }

  closeSplashPreview(): void {
    this.isSplashPreviewActive = false;
  }

  get filteredStories(): ChampionshipStory[] {
    const list = this.contentService.championshipStories || [];
    if (!this.storySearchQuery.trim()) return list;
    const q = this.storySearchQuery.toLowerCase().trim();
    return list.filter(s =>
      s.title?.toLowerCase().includes(q) ||
      s.tag?.toLowerCase().includes(q) ||
      s.body?.toLowerCase().includes(q) ||
      s.date?.toLowerCase().includes(q)
    );
  }

  get filteredHofEntries(): HallOfFameEntry[] {
    const list = this.contentService.hallOfFameEntries || [];
    if (!this.hofSearchQuery.trim()) return list;
    const q = this.hofSearchQuery.toLowerCase().trim();
    return list.filter(e =>
      e.name?.toLowerCase().includes(q) ||
      e.school?.toLowerCase().includes(q) ||
      e.year?.toLowerCase().includes(q) ||
      e.badge?.toLowerCase().includes(q) ||
      e.projectTitle?.toLowerCase().includes(q) ||
      (e.members && e.members.some(m => m.toLowerCase().includes(q)))
    );
  }

  get filteredLeaderboard(): LeaderboardEntry[] {
    const list = this.contentService.leaderboardData || [];
    if (!this.lbSearchQuery.trim()) return list;
    const q = this.lbSearchQuery.toLowerCase().trim();
    return list.filter(l =>
      l.schoolName?.toLowerCase().includes(q) ||
      l.location?.toLowerCase().includes(q) ||
      l.region?.toLowerCase().includes(q)
    );
  }

  get filteredTalentDiscovery(): TalentDiscovery[] {
    const list = this.contentService.talentDiscovery || [];
    if (!this.tdSearchQuery.trim()) return list;
    const q = this.tdSearchQuery.toLowerCase().trim();
    return list.filter(t =>
      t.studentName?.toLowerCase().includes(q) ||
      t.category?.toLowerCase().includes(q) ||
      t.schoolAndGrade?.toLowerCase().includes(q) ||
      t.score?.toLowerCase().includes(q)
    );
  }

  get filteredNewsItems(): NewsFeedItem[] {
    const list = this.contentService.newsFeedItems || [];
    if (!this.newsSearchQuery.trim()) return list;
    const q = this.newsSearchQuery.toLowerCase().trim();
    return list.filter(n =>
      n.headline?.toLowerCase().includes(q) ||
      n.tag?.toLowerCase().includes(q) ||
      n.date?.toLowerCase().includes(q)
    );
  }

  get filteredEvents(): UpcomingEvent[] {
    const list = this.contentService.upcomingEvents || [];
    if (!this.eventsSearchQuery.trim()) return list;
    const q = this.eventsSearchQuery.toLowerCase().trim();
    return list.filter(e =>
      e.title?.toLowerCase().includes(q) ||
      e.location?.toLowerCase().includes(q) ||
      e.description?.toLowerCase().includes(q) ||
      e.month?.toLowerCase().includes(q) ||
      e.day?.toLowerCase().includes(q)
    );
  }

  setCmsCategory(category: 'all' | 'landing' | 'competitions' | 'broadcast'): void {
    this.cmsCategoryFilter = category;
    if (category === 'landing' && !['stories', 'slideshow', 'philosophy', 'stats', 'countdown', 'pagecopy'].includes(this.contentTab)) {
      this.contentTab = 'stories';
    } else if (category === 'competitions' && !['leaderboard', 'hof', 'talent'].includes(this.contentTab)) {
      this.contentTab = 'leaderboard';
    } else if (category === 'broadcast' && !['news', 'events'].includes(this.contentTab)) {
      this.contentTab = 'news';
    }
    this.persistNavState();
  }

  isCmsTabVisible(tab: string): boolean {
    if (this.cmsCategoryFilter === 'all') return true;
    if (this.cmsCategoryFilter === 'landing') return ['stories', 'slideshow', 'philosophy', 'stats', 'countdown', 'pagecopy'].includes(tab);
    if (this.cmsCategoryFilter === 'competitions') return ['leaderboard', 'hof', 'talent'].includes(tab);
    if (this.cmsCategoryFilter === 'broadcast') return ['news', 'events'].includes(tab);
    return true;
  }

  getTotalContentCount(): number {
    return (this.contentService.championshipStories?.length || 0) +
           (this.contentService.hallOfFameEntries?.length || 0) +
           (this.contentService.leaderboardData?.length || 0) +
           (this.contentService.talentDiscovery?.length || 0) +
           (this.contentService.newsFeedItems?.length || 0) +
           (this.contentService.upcomingEvents?.length || 0) +
           (this.contentService.heroSlides?.length || 0) +
           (this.contentService.philosophyCards?.length || 0);
  }

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

  // Countdown settings
  countdownInput: string = '';
  previewDays = 0;
  previewHours = 0;
  previewMins = 0;
  previewSecs = 0;

  // School Admin Portal Specific Flow
  schoolName = '';
  schoolAvatarUrl: string | null = null;
  schoolAvatarInitials = '';
  isAddTeamModalOpen = false;
  teamForm = { id: undefined as string | undefined, name: '', track: 'Coding', lead: '', members: 4, mentor: '', motto: '', memberNames: ['', '', '', '', '', '', '', ''], leadEmail: '', memberEmails: ['', '', '', '', '', '', '', ''] };

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
  isRefreshingSessions = false;
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
    this.recomputeSchoolAdminData();
  }

  private _cachedRoleDistribution: { role: string; label: string; count: number; percent: number; icon: string }[] = [];

  recomputeRoleDistribution(): void {
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
    this._cachedRoleDistribution = Object.keys(roleMeta).map(role => ({
      role,
      label: roleMeta[role].label,
      icon: roleMeta[role].icon,
      count: counts[role] || 0,
      percent: Math.round(((counts[role] || 0) / total) * 100),
    }));
  }

  get roleDistribution(): { role: string; label: string; count: number; percent: number; icon: string }[] {
    if (!this._cachedRoleDistribution.length) {
      this.recomputeRoleDistribution();
    }
    return this._cachedRoleDistribution;
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

  /**
   * The signed-in student's own submissions.
   *
   * The filter used to be the literal `s.student === 'Kwame Asante'`, so this
   * panel was empty for every real student and showed seeded demo rows for
   * nobody. Matching is now against the actual account, by student id (what the
   * backend stores) or email/name (what older cached rows carry).
   */
  /**
   * Real figures for the student dashboard.
   *
   * Replaces four hardcoded stat cards and two panels that were declared and then
   * never assigned anywhere in the codebase (`enrolledTracks`, and the course
   * leaderboard), so they rendered as permanently empty grids.
   */
  studentSummary = {
    courses: 0, avgProgress: 0, submissions: 0,
    graded: 0, awaiting: 0, avgGrade: null as number | null,
  };
  /** The student's enrolled courses. `enrolledTracks` was never populated. */
  studentEnrolments: MyEnrolledCourse[] = [];
  studentRecentSubmissions: MySubmission[] = [];
  isLoadingStudentSummary = false;

  // The student's own teams (solo or squad) + mentor status, so a solo entrant
  // can see their team and request a mentor.
  myTeams: Array<{
    id: string; name: string; track: string; competitionId: string | null;
    mentorId: string | null; mentorStatus: string; isSolo: boolean; isLead: boolean;
  }> = [];

  loadMyTeams(): void {
    this.apiService.getMyTeams().subscribe({
      next: rows => {
        const seen = new Set<string>();
        this.myTeams = (rows || []).filter(t => {
          if (!t.id || seen.has(t.id)) return false;
          seen.add(t.id);
          return true;
        });
        this.cdr.markForCheck();
      },
      error: () => {
        this.myTeams = [];
        this.cdr.markForCheck();
      }
    });
  }

  // ─── STUDENT MENTOR REQUEST MODAL STATE ─────────────────────────
  requestMentorModalOpen: boolean = false;
  requestMentorTeam: any = null;
  requestMentorTab: 'pool' | 'suggest' = 'pool';
  requestMentorMode: 'auto_track' | 'existing' = 'auto_track';
  requestMentorSelectedInstructorId: string = '';
  requestMentorSuggestedForm = {
    name: '',
    email: '',
    phone: '',
    organization: '',
    expertise: '',
    bio: ''
  };
  isSubmittingMentorRequest: boolean = false;

  openRequestMentorModal(team: any): void {
    this.requestMentorTeam = team;
    this.requestMentorModalOpen = true;
    this.requestMentorTab = 'pool';
    this.requestMentorMode = 'auto_track';
    this.requestMentorSelectedInstructorId = '';
    this.requestMentorSuggestedForm = {
      name: '',
      email: '',
      phone: '',
      organization: '',
      expertise: team?.track || '',
      bio: ''
    };
    this.cdr.markForCheck();
  }

  closeRequestMentorModal(): void {
    this.requestMentorModalOpen = false;
    this.requestMentorTeam = null;
    this.isSubmittingMentorRequest = false;
    this.cdr.markForCheck();
  }

  submitStudentMentorRequest(payload?: any): void {
    if (!this.requestMentorTeam?.id) return;
    this.isSubmittingMentorRequest = true;

    if (!payload) {
      payload = { mode: this.requestMentorMode };
      if (this.requestMentorTab === 'pool') {
        if (this.requestMentorMode === 'existing') {
          if (!this.requestMentorSelectedInstructorId) {
            this.dialogService.toast('Please select an instructor from the pool.', 'warning');
            this.isSubmittingMentorRequest = false;
            return;
          }
          payload = { mode: 'existing', mentor_id: this.requestMentorSelectedInstructorId };
        } else {
          payload = { mode: 'auto_track' };
        }
      } else {
        const f = this.requestMentorSuggestedForm;
        if (!f.name.trim()) {
          this.dialogService.toast('Please enter the nominee mentor\'s full name.', 'warning');
          this.isSubmittingMentorRequest = false;
          return;
        }
        if (!f.email.trim() || !f.email.includes('@')) {
          this.dialogService.toast('Please enter a valid official email address.', 'warning');
          this.isSubmittingMentorRequest = false;
          return;
        }
        payload = {
          mode: 'suggested',
          suggested_name: f.name.trim(),
          suggested_email: f.email.trim(),
          suggested_phone: f.phone.trim(),
          suggested_org: f.organization.trim(),
          suggested_expertise: f.expertise.trim(),
          suggested_bio: f.bio.trim()
        };
      }
    } else if (payload.mode === 'suggested') {
      if (!payload.suggested_name?.trim()) {
        this.dialogService.toast('Please enter the nominee mentor\'s full name.', 'warning');
        this.isSubmittingMentorRequest = false;
        return;
      }
      if (!payload.suggested_email?.trim() || !payload.suggested_email.includes('@')) {
        this.dialogService.toast('Please enter a valid official email address.', 'warning');
        this.isSubmittingMentorRequest = false;
        return;
      }
    } else if (payload.mode === 'existing' && !payload.mentor_id) {
      this.dialogService.toast('Please select an instructor from the pool.', 'warning');
      this.isSubmittingMentorRequest = false;
      return;
    }

    this.apiService.requestTeamMentor(this.requestMentorTeam.id, payload).subscribe({
      next: (res: any) => {
        this.isSubmittingMentorRequest = false;
        const msg = res?.mentor_status === 'pending_school'
          ? 'Mentor request submitted! Forwarded to your school administration for review.'
          : 'Mentor request submitted! Awaiting platform review.';
        this.dialogService.toast(msg, 'success');
        this.closeRequestMentorModal();
        this.loadMyTeams();
      },
      error: (err: any) => {
        this.isSubmittingMentorRequest = false;
        const detail = err?.error?.detail || 'Could not submit mentor request.';
        this.dialogService.toast(detail, 'error');
        this.cdr.markForCheck();
      }
    });
  }

  requestMentor(teamId: string): void {
    const team = this.myTeams.find(t => t.id === teamId);
    if (team) {
      this.openRequestMentorModal(team);
    } else {
      this.apiService.requestTeamMentor(teamId).subscribe({
        next: () => {
          this.dialogService.toast('Mentor requested.', 'success');
          this.loadMyTeams();
        },
        error: (err: any) => {
          const detail = err?.error?.detail || 'Could not request a mentor.';
          this.dialogService.toast(detail, 'error');
        }
      });
    }
  }

  // ─── INSTITUTION MENTOR APPROVALS (SCHOOL ADMIN) ─────────────
  institutionMentorRequests: any[] = [];
  isLoadingInstitutionApprovals: boolean = false;
  selectedInstitutionApproval: any = null;
  institutionDecisionModalOpen: boolean = false;
  institutionDecisionAction: 'approve' | 'reject' = 'approve';
  institutionDecisionNotes: string = '';
  isProcessingInstitutionDecision: boolean = false;

  loadInstitutionApprovals(): void {
    this.isLoadingInstitutionApprovals = true;
    this.apiService.getInstitutionApprovals().subscribe({
      next: (list: any[]) => {
        this.institutionMentorRequests = (list || []).filter(
          item => item.type === 'Mentor Request' && item.status === 'pending_institution'
        );
        this.isLoadingInstitutionApprovals = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.institutionMentorRequests = [];
        this.isLoadingInstitutionApprovals = false;
        this.cdr.markForCheck();
      }
    });
  }

  openInstitutionDecisionModal(req: any, action: 'approve' | 'reject'): void {
    this.selectedInstitutionApproval = req;
    this.institutionDecisionAction = action;
    this.institutionDecisionNotes = '';
    this.institutionDecisionModalOpen = true;
    this.cdr.markForCheck();
  }

  closeInstitutionDecisionModal(): void {
    this.institutionDecisionModalOpen = false;
    this.selectedInstitutionApproval = null;
    this.isProcessingInstitutionDecision = false;
    this.cdr.markForCheck();
  }

  submitInstitutionDecision(event?: { action: 'approve' | 'reject'; notes: string }): void {
    if (!this.selectedInstitutionApproval?.id) return;
    this.isProcessingInstitutionDecision = true;

    const action = event?.action || this.institutionDecisionAction;
    const notes = event?.notes !== undefined ? event.notes : this.institutionDecisionNotes;

    this.apiService.institutionApprovalDecision(
      this.selectedInstitutionApproval.id,
      action,
      notes
    ).subscribe({
      next: () => {
        this.isProcessingInstitutionDecision = false;
        const msg = action === 'approve'
          ? 'Mentor request approved! Escalated to NTIC Super Admin for final provisioning.'
          : 'Mentor request declined.';
        this.dialogService.toast(msg, 'success');
        this.closeInstitutionDecisionModal();
        this.loadInstitutionApprovals();
      },
      error: (err: any) => {
        this.isProcessingInstitutionDecision = false;
        const detail = err?.error?.detail || 'Could not process institution decision.';
        this.dialogService.toast(detail, 'error');
        this.cdr.markForCheck();
      }
    });
  }

  // ─── MENTOR & INSTRUCTOR ALLOCATION PORTAL ─────────────────
  mentorSearchQuery: string = '';
  mentorStatusFilter: 'all' | 'unassigned' | 'requested' | 'assigned' = 'all';
  mentorTrackFilter: string = 'all';
  mentorTypeFilter: 'all' | 'squad' | 'solo' = 'all';
  selectedMentorInstructorFilter: string = '';
  mentorActionInProgress: { [teamId: string]: boolean } = {};
  selectedMentorForTeam: { [teamId: string]: string } = {};

  get allPlatformInstructors(): any[] {
    const users = this.registeredUsers || [];
    const teams = (this.contentService.teams || []).filter(t => (t.status || '').toLowerCase() !== 'disbanded');
    return users
      .filter(u => (u.role || '').toLowerCase() === 'instructor')
      .map(inst => {
        const id = inst.id;
        const assignedTeams = teams.filter(t => (t.mentorId === id || t.mentor_id === id));
        return {
          id: inst.id,
          name: inst.fullName || inst.full_name || inst.name || inst.email || 'Instructor',
          email: inst.email || '',
          track: inst.track || '',
          organization: inst.organization || inst.school || '',
          status: inst.status || 'Active',
          assignedCount: assignedTeams.length,
          assignedTeams
        };
      })
      .sort((a, b) => b.assignedCount - a.assignedCount || a.name.localeCompare(b.name));
  }

  get mentorAllocationStats(): {
    total: number;
    assigned: number;
    unassigned: number;
    requested: number;
    pct: number;
    instructorCount: number;
    avgLoad: string;
  } {
    const teams = (this.contentService.teams || []).filter(t => (t.status || '').toLowerCase() !== 'disbanded');
    const total = teams.length;
    const assigned = teams.filter(t => !!(t.mentorId || t.mentor_id)).length;
    const requested = teams.filter(t => !(t.mentorId || t.mentor_id) && (t.mentorStatus === 'requested' || t.mentor_status === 'requested')).length;
    const unassigned = total - assigned;
    const pct = total > 0 ? Math.round((assigned / total) * 100) : 0;
    const instructors = this.allPlatformInstructors;
    const avgLoad = instructors.length > 0 ? (assigned / instructors.length).toFixed(1) : '0';
    return { total, assigned, unassigned, requested, pct, instructorCount: instructors.length, avgLoad };
  }

  get filteredMentorTeams(): any[] {
    let list = (this.contentService.teams || []).filter(t => (t.status || '').toLowerCase() !== 'disbanded');
    const q = (this.mentorSearchQuery || '').trim().toLowerCase();
    if (q) {
      list = list.filter(t => {
        const name = (t.name || '').toLowerCase();
        const lead = (t.lead || '').toLowerCase();
        const school = (t.schoolName || t.school_name || '').toLowerCase();
        const track = (t.track || '').toLowerCase();
        const mentorName = this.getMentorName(t.mentorId || t.mentor_id).toLowerCase();
        return name.includes(q) || lead.includes(q) || school.includes(q) || track.includes(q) || mentorName.includes(q);
      });
    }
    if (this.mentorStatusFilter === 'assigned') {
      list = list.filter(t => !!(t.mentorId || t.mentor_id));
    } else if (this.mentorStatusFilter === 'unassigned') {
      list = list.filter(t => !(t.mentorId || t.mentor_id));
    } else if (this.mentorStatusFilter === 'requested') {
      list = list.filter(t => !(t.mentorId || t.mentor_id) && (t.mentorStatus === 'requested' || t.mentor_status === 'requested'));
    }
    if (this.mentorTrackFilter && this.mentorTrackFilter !== 'all') {
      list = list.filter(t => (t.track || '').toLowerCase() === this.mentorTrackFilter.toLowerCase());
    }
    if (this.mentorTypeFilter === 'squad') {
      list = list.filter(t => !t.isSolo && !t.is_solo);
    } else if (this.mentorTypeFilter === 'solo') {
      list = list.filter(t => !!(t.isSolo || t.is_solo));
    }
    if (this.selectedMentorInstructorFilter) {
      list = list.filter(t => (t.mentorId === this.selectedMentorInstructorFilter || t.mentor_id === this.selectedMentorInstructorFilter));
    }
    return list;
  }

  getMentorName(mentorId: string | null | undefined): string {
    if (!mentorId) return 'Unassigned';
    const inst = (this.registeredUsers || []).find(u => u.id === mentorId);
    return inst ? (inst.fullName || inst.full_name || inst.name || inst.email || 'Instructor') : 'Assigned Instructor';
  }

  getMentorObj(mentorId: string | null | undefined): any {
    if (!mentorId) return null;
    return (this.registeredUsers || []).find(u => u.id === mentorId) || null;
  }

  isTrackMatch(teamTrack: string | null | undefined, instructorTrack: string | null | undefined): boolean {
    if (!teamTrack || !instructorTrack) return false;
    const tt = teamTrack.toLowerCase().trim();
    const it = instructorTrack.toLowerCase().trim();
    return tt.includes(it) || it.includes(tt) || (tt === 'ai' && it.includes('ai')) || (tt === 'coding' && it.includes('code'));
  }

  activeMentorModalTeam: any = null;
  mentorPickerSearchQuery: string = '';

  openMentorModal(team: any, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.activeMentorModalTeam = team;
    this.mentorPickerSearchQuery = '';
  }

  closeMentorModal(): void {
    this.activeMentorModalTeam = null;
    this.mentorPickerSearchQuery = '';
  }

  getFilteredPickerInstructors(teamTrack?: string): any[] {
    let list = this.allPlatformInstructors || [];
    if (this.mentorPickerSearchQuery.trim()) {
      const q = this.mentorPickerSearchQuery.toLowerCase().trim();
      list = list.filter(i => 
        (i.name && i.name.toLowerCase().includes(q)) ||
        (i.track && i.track.toLowerCase().includes(q)) ||
        (i.email && i.email.toLowerCase().includes(q))
      );
    }
    if (teamTrack) {
      list = [...list].sort((a, b) => {
        const matchA = this.isTrackMatch(teamTrack, a.track) ? 1 : 0;
        const matchB = this.isTrackMatch(teamTrack, b.track) ? 1 : 0;
        return matchB - matchA;
      });
    }
    return list;
  }

  selectMentorForTeam(teamId: string, mentorId: string): void {
    this.closeMentorModal();
    this.assignMentorToTeam(teamId, mentorId);
  }

  isRefreshingMentors = false;

  refreshMentorAllocationData(): void {
    if (this.isRefreshingMentors) return;
    this.isRefreshingMentors = true;
    this.contentService.refreshBackendData();
    this.loadApprovalsFromBackend();
    this.loadPersonnel();
    setTimeout(() => {
      this.isRefreshingMentors = false;
      this.dialogService.toast('Mentor & Instructor records refreshed from database.', 'success');
      this.cdr.markForCheck();
    }, 850);
  }

  assignMentorToTeam(teamId: string, mentorId: string | null): void {
    if (!teamId) return;
    this.mentorActionInProgress[teamId] = true;
    this.apiService.assignTeamMentor(teamId, mentorId || null).subscribe({
      next: () => {
        this.mentorActionInProgress[teamId] = false;
        if (mentorId) {
          const mName = this.getMentorName(mentorId);
          this.dialogService.toast(`Assigned ${mName} as mentor.`, 'success');
        } else {
          this.dialogService.toast('Mentor unassigned.', 'info');
        }
        this.contentService.refreshBackendData();
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.mentorActionInProgress[teamId] = false;
        const detail = err?.error?.detail || 'Could not update mentor assignment.';
        this.dialogService.toast(detail, 'error');
        this.cdr.markForCheck();
      }
    });
  }

  async unassignMentorFromTeam(teamId: string, teamName?: string): Promise<void> {
    const ok = await this.dialogService.confirm({
      title: 'Unassign Mentor',
      message: `Are you sure you want to remove the assigned mentor from "${teamName || 'this team'}"?`,
      confirmText: 'Unassign',
      type: 'warning'
    });
    if (!ok) return;
    this.assignMentorToTeam(teamId, null);
  }

  filterByInstructor(instructorId: string): void {
    if (this.selectedMentorInstructorFilter === instructorId) {
      this.selectedMentorInstructorFilter = '';
    } else {
      this.selectedMentorInstructorFilter = instructorId;
      this.mentorStatusFilter = 'all';
    }
  }

  clearMentorFilters(): void {
    this.mentorSearchQuery = '';
    this.mentorStatusFilter = 'all';
    this.mentorTrackFilter = 'all';
    this.mentorTypeFilter = 'all';
    this.selectedMentorInstructorFilter = '';
  }

  /** Admin: give every mentor-less team (squad or solo) an instructor. */
  async autoAssignMentors(): Promise<void> {
    const ok = await this.dialogService.confirm({
      title: 'Auto-assign Mentors',
      message: 'Assign an instructor to every team that has no mentor yet? Matched by track where possible and balanced across instructors.',
      confirmText: 'Assign',
      type: 'info'
    });
    if (!ok) return;
    this.apiService.autoAssignMentors().subscribe({
      next: res => {
        this.dialogService.toast(`${res.assigned} team${res.assigned === 1 ? '' : 's'} assigned a mentor.`, 'success');
        this.contentService.refreshBackendData();
      },
      error: (err: any) => {
        const detail = err?.error?.detail || 'Could not auto-assign mentors.';
        this.dialogService.toast(detail, 'error');
      }
    });
  }

  loadStudentSummary(): void {
    if (this.activeRoleId !== 'student') return;
    this.isLoadingStudentSummary = true;

    this.apiService.getMyEnrolments().subscribe({
      next: rows => {
        this.studentEnrolments = rows || [];
        const count = this.studentEnrolments.length;
        const avg = count
          ? Math.round(this.studentEnrolments.reduce((s, e) => s + (e.progress_pct || 0), 0) / count)
          : 0;
        this.studentSummary = { ...this.studentSummary, courses: count, avgProgress: avg };
        this.isLoadingStudentSummary = false;
        this.loadDashboardData();
        this.cdr.markForCheck();
      },
      error: () => { this.isLoadingStudentSummary = false; },
    });

    this.apiService.getMySubmissions().subscribe({
      next: rows => {
        this.studentRecentSubmissions = rows || [];
        const graded = this.studentRecentSubmissions.filter(s => s.score !== null);
        const avgGrade = graded.length
          ? Math.round(graded.reduce((s, r) => s + (r.score || 0), 0) / graded.length)
          : null;
        this.studentSummary = {
          ...this.studentSummary,
          submissions: this.studentRecentSubmissions.length,
          graded: graded.length,
          awaiting: this.studentRecentSubmissions.length - graded.length,
          avgGrade,
        };
        this.loadDashboardData();
        this.cdr.markForCheck();
      },
      error: () => { /* stats stay at zero rather than showing invented numbers */ },
    });
  }

  get mySubmissions(): any[] {
    const me = this.currentUserService.profile();
    if (!me) return [];
    const myId = (me.student_id || me.id || '').toLowerCase();
    const myEmail = (me.email || '').toLowerCase();
    const myName = (me.full_name || '').toLowerCase();

    return this.contentService.submissions
      .filter(s => {
        const owner = String(s.student || '').toLowerCase();
        const ownerEmail = String((s as any).student_email || '').toLowerCase();
        if (!owner && !ownerEmail) return false;
        return owner === myId || owner === myEmail || owner === myName
          || (!!ownerEmail && ownerEmail === myEmail);
      })
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
        student: s.student,
        school: s.school,
        assignment: s.assignment,
        team: s.student + ' (' + s.school + ')',
        project: s.assignment,
        track: s.track?.toLowerCase() || '',
        submitted: s.time,
        score: s.score
      }));
  }

  get pendingJudgeSubmissionsCount(): number {
    return this.assignedSubmissions.filter(s => s.score === null).length;
  }

  get scoredJudgeSubmissionsCount(): number {
    return this.assignedSubmissions.filter(s => s.score !== null).length;
  }

  get judgeScoringCompletionPct(): number {
    const total = this.assignedSubmissions.length;
    if (total === 0) return 0;
    return Math.round((this.scoredJudgeSubmissionsCount / total) * 100);
  }

  get activeSessionsMeta(): string {
    return '';
  }

  get recentScoredJudgeSubmissions(): any[] {
    return this.assignedSubmissions.filter(s => s.score !== null).slice(0, 5);
  }



  exportScoresFromDashboard(): void {
    const scored = this.assignedSubmissions.filter(s => s.score !== null);
    if (scored.length === 0) return;
    const rows = [
      ['Student', 'School', 'Track', 'Assignment', 'Score', 'Submitted'],
      ...scored.map(s => [s.student, s.school, s.track, s.assignment, s.score ?? '', s.submitted])
    ];
    const csv = rows.map(r => r.map((c: any) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `judge-scores-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  openScoringFromDashboard(_sub: any): void {
    this.router.navigate(['/judge']);
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

  // Sponsorship Tier Modal & Drilldown State
  selectedSponsorTier: any = null;
  sponsorTierModalOpen = false;
  sponsorTierSearch = '';

  openSponsorTierModal(tier: any): void {
    this.selectedSponsorTier = tier;
    this.sponsorTierSearch = '';
    this.sponsorTierModalOpen = true;
  }

  openSponsorPartner(tierKey: string, partnerName: string): void {
    const tier = this.sponsorInfographic.tiers.find((t: any) => t.key === tierKey);
    if (tier) {
      this.selectedSponsorTier = tier;
      this.sponsorTierSearch = partnerName || '';
      this.sponsorTierModalOpen = true;
    }
  }

  closeSponsorTierModal(): void {
    this.sponsorTierModalOpen = false;
    this.selectedSponsorTier = null;
    this.sponsorTierSearch = '';
  }

  get featuredBrandLogos(): any[] {
    const sponsors = this.registeredUsers.filter(u => u.role === 'sponsor');
    return sponsors.map(u => {
      const name = u.organization || u.full_name || u.email || 'Corporate Partner';
      const words = name.split(/\s+/).filter(Boolean);
      const short = words.length > 2 ? words.slice(0, 2).join(' ') : name;
      const tierKey = this.normalizeSponsorTierKey(u.tier);
      const style = this.sponsorTierStyle(tierKey);
      return {
        name,
        short,
        tierKey,
        badge: (u.tier || 'SPONSOR').toUpperCase(),
        color: style.color,
        textColor: tierKey === 'platinum' ? '#000' : '#fff',
        icon: style.icon,
        role: u.sector || 'Corporate Partner'
      };
    });
  }

  private normalizeSponsorTierKey(tier: string): string {
    const s = (tier || '').toLowerCase();
    if (s.includes('platinum')) return 'platinum';
    if (s.includes('gold')) return 'gold';
    if (s.includes('silver')) return 'silver';
    if (s.includes('inkind') || s.includes('in-kind') || s.includes('in kind')) return 'inkind';
    if (s.includes('bronze')) return 'bronze';
    return 'other';
  }

  private sponsorTierStyle(key: string): { color: string; icon: string } {
    const styles: Record<string, { color: string; icon: string }> = {
      platinum: { color: '#ffcc00', icon: 'workspace_premium' },
      gold: { color: '#d97706', icon: 'workspace_premium' },
      silver: { color: '#2563eb', icon: 'terminal' },
      inkind: { color: '#334155', icon: 'inventory_2' },
      bronze: { color: '#b45309', icon: 'emoji_events' },
      other: { color: '#0ea5e9', icon: 'business' }
    };
    return styles[key] || styles['other'];
  }

  get filteredTierPartners(): any[] {
    if (!this.selectedSponsorTier || !this.selectedSponsorTier.partners) return [];
    const q = this.sponsorTierSearch.trim().toLowerCase();
    if (!q) return this.selectedSponsorTier.partners;
    return this.selectedSponsorTier.partners.filter((p: any) =>
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.type && p.type.toLowerCase().includes(q)) ||
      (p.contribution && p.contribution.toLowerCase().includes(q)) ||
      (p.beneficiaries && p.beneficiaries.toLowerCase().includes(q)) ||
      (p.status && p.status.toLowerCase().includes(q))
    );
  }

  exportSponsorTierCsv(tier: any): void {
    if (!tier || !tier.partners || tier.partners.length === 0) return;
    const rows = [
      ['Tier', 'Partner Name', 'Category', 'Contribution & Items', 'Est. Value', 'Beneficiaries', 'ESG Status'],
      ...tier.partners.map((p: any) => [
        tier.badge,
        p.name,
        p.type,
        p.contribution,
        p.valueFormatted || p.value,
        p.beneficiaries,
        p.status
      ])
    ];
    const csv = rows.map(r => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ntic-sponsors-${tier.key}-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Real sponsorship figures from GET /api/sponsorships/summary.
   *
   * This getter used to be ~240 lines of hardcoded data presented as live
   * analytics: four tier objects naming MTN Ghana, Tullow Oil, GCB Bank, Fidelity,
   * Stanbic, Tech Hubs, GDG Accra, KIC, Ghana Tech Lab, Voltic, Coca-Cola, HP,
   * EPP and Printex, each with invented contribution amounts, beneficiaries and
   * statuses ("Disbursed to Teams", "Allocated in Escrow"). Alongside them:
   *
   *   totalCommitted   summed from those literals (GH 930,000)
   *   disbursedFunds   totalCommitted * 0.72   <- a made-up ratio
   *   impactScore      the string "98.4%"
   *   prizePool        the string "GH 120,000"
   *   studentsReached  teams.length * 25, or 48 * 25 when there were no teams
   *
   * None of it had a source, and there was no table it could have come from.
   * Every figure below is now computed by the database from the sponsorships and
   * sponsorship_payments tables, and `disbursed` means money an administrator has
   * actually verified against a bank record.
   */
  sponsorSummary: SponsorshipSummary | null = null;
  /** Individual commitments, used for the per-tier drilldown. Admin-only endpoint. */
  allSponsorships: Sponsorship[] = [];
  isLoadingSponsorSummary = false;
  sponsorSummaryError = '';

  loadSponsorSummary(): void {
    this.isLoadingSponsorSummary = true;
    this.sponsorSummaryError = '';
    this.apiService.getSponsorshipSummary().subscribe({
      next: summary => {
        this.sponsorSummary = summary;
        this.isLoadingSponsorSummary = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoadingSponsorSummary = false;
        // Show nothing rather than falling back to invented figures.
        this.sponsorSummary = null;
        this.sponsorSummaryError = 'Could not load sponsorship figures.';
      },
    });

    // The drilldown list. Only administrators may read this, so a 403 simply means
    // the panel shows totals without the per-partner breakdown.
    this.apiService.getAllSponsorships().subscribe({
      next: rows => { this.allSponsorships = rows || []; this.cdr.markForCheck(); },
      error: () => (this.allSponsorships = []),
    });
  }

  /** Tier colours, keyed by the tier name a sponsor actually entered. */
  private tierColour(tier: string): string {
    const key = (tier || '').toLowerCase();
    if (key.includes('platinum')) return '#3b82f6';
    if (key.includes('gold')) return '#f59e0b';
    if (key.includes('silver')) return '#14b8a6';
    if (key.includes('bronze')) return '#a855f7';
    if (key.includes('kind')) return '#a855f7';
    return '#94a3b8';
  }

  /** Formats a NUMERIC string for display without float arithmetic. */
  formatCedis(amount: string | number | null | undefined): string {
    if (amount === null || amount === undefined || amount === '') return 'GH\u20B5 0';
    const n = Number(amount);
    if (!isFinite(n)) return 'GH\u20B5 0';
    return 'GH\u20B5 ' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  get sponsorInfographic(): SponsorInfographic {
    const s = this.sponsorSummary;
    const tiers = (s?.tiers || []).map(t => ({
      key: (t.tier || '').toLowerCase().replace(/[^a-z]/g, '') || 'other',
      badge: (t.tier || 'Unspecified').toUpperCase(),
      shortLabel: `${t.pct}% ${t.tier}`,
      title: t.tier,
      pct: t.pct,
      amount: Number(t.amount) || 0,
      amountFormatted: this.formatCedis(t.amount),
      sponsorCount: t.sponsor_count,
      colour: this.tierColour(t.tier),
      // Real commitments in this tier, for the drilldown. Previously this was a
      // literal array of invented partners with fabricated contribution text,
      // beneficiary lists and "ESG verified" flags.
      partners: this.allSponsorships
        .filter(sp => (sp.tier || 'Unspecified') === t.tier)
        .map(sp => ({
          name: sp.organization || 'Corporate Partner',
          type: sp.sector || 'Sponsor',
          categoryIcon: 'domain',
          // Only what the database can prove.
          contribution: `Pledged ${this.formatCedis(sp.amount_pledged)}`,
          value: Number(sp.amount_pledged) || 0,
          valueFormatted: this.formatCedis(sp.amount_pledged),
          receivedFormatted: this.formatCedis(sp.amount_received),
          pendingFormatted: this.formatCedis(sp.amount_pending),
          beneficiaries: '',
          status: sp.status,
        })),
      brands: this.allSponsorships
        .filter(sp => (sp.tier || 'Unspecified') === t.tier)
        .map(sp => sp.organization)
        .filter(Boolean)
        .slice(0, 4)
        .join(' · '),
      metaIcon: 'groups',
      metaText: `${t.sponsor_count} sponsor${t.sponsor_count === 1 ? '' : 's'}`,
    }));

    return {
      partnerCount: s?.partner_count ?? 0,
      totalCommitted: Number(s?.total_committed) || 0,
      totalCommittedFormatted: this.formatCedis(s?.total_committed),
      // "Disbursed" now means verified receipts, not committed * 0.72.
      disbursedFunds: Number(s?.total_received) || 0,
      disbursedFundsFormatted: this.formatCedis(s?.total_received),
      awaitingVerificationFormatted: this.formatCedis(s?.awaiting_verification),
      awaitingVerificationCount: s?.awaiting_verification_count ?? 0,
      pendingPledges: s?.pending_pledges ?? 0,
      receivedPct: s?.received_pct ?? 0,
      sponsoredTeamsCount: this.contentService.teams?.length ?? 0,
      studentsReached: this.registeredUsers.filter(u => u.role === 'student').length,
      groupsReached: (this.dashboardRecords?.filter(r => r.type === 'school').length ?? 0) || (this.contentService.platformStats?.schools ?? 0) || (new Set((this.contentService.teams || []).map(t => t.schoolName).filter(Boolean))).size,
      totalBeneficiaries: (this.registeredUsers.filter(u => u.role === 'student').length) + ((this.contentService.teams || []).reduce((acc, t) => acc + (typeof t.members === 'number' ? t.members : (Array.isArray(t.members) ? (t.members as any).length : 0)), 0)),
      tiers,
      sectors: s?.sectors || [],
      hasData: !!s && (s.partner_count > 0 || Number(s.total_committed) > 0),
    };
  }

  get sponsorTierDonut(): string {
    const colors: Record<string, string> = {
      platinum: '#3b82f6',
      gold: '#f59e0b',
      silver: '#14b8a6',
      inkind: '#a855f7',
      bronze: '#a855f7'
    };
    let cumulative = 0;
    const segments: string[] = [];
    for (const tier of this.sponsorInfographic.tiers) {
      const start = cumulative;
      const end = cumulative + (tier.pct || 0);
      const color = colors[tier.key] || '#94a3b8';
      segments.push(`${color} ${start}% ${end}%`);
      cumulative = end;
    }
    return `conic-gradient(${segments.join(', ')})`;
  }

  get sponsorFundingBars() {
    const info = this.sponsorInfographic;
    const total = info.totalCommitted || 0;
    const disbursed = info.disbursedFunds || 0;
    const awaiting = info.awaitingVerificationCount || 0;
    const partners = info.partnerCount || 0;
    const students = info.studentsReached || 0;
    const teams = info.sponsoredTeamsCount || 0;
    const groups = info.groupsReached || 0;
    const studentsTarget = 1200;
    const studentsPct = students > 0 ? Math.max(4, Math.min(100, Math.round((students / studentsTarget) * 100))) : (teams > 0 ? Math.max(4, Math.min(100, Math.round((teams / 48) * 100))) : 0);
    return [
      { label: 'Total Committed', value: info.totalCommittedFormatted, pct: total > 0 ? 100 : 0, cls: 'cc-bar-blue' },
      { label: 'Disbursed Funds', value: info.disbursedFundsFormatted, pct: disbursed > 0 ? Math.max(4, Math.round((disbursed / (total || 1)) * 100)) : 0, cls: 'cc-bar-teal' },
      { label: 'Awaiting Verification', value: info.awaitingVerificationFormatted, pct: awaiting > 0 ? Math.max(4, Math.round((awaiting / Math.max(1, partners)) * 100)) : 0, cls: 'cc-bar-amber' },
      { label: 'Students, Teams & Groups', value: `${students} Students · ${teams} Teams · ${groups} Groups`, pct: studentsPct, cls: 'cc-bar-purple' }
    ];
  }

  // `_cachedSponsorInfographic` / `_lastSponsorsHash` were here. They memoised the
  // old hardcoded array against a hash of list lengths. The data now comes from the
  // server and is held in `sponsorSummary`, so there is nothing to memoise.

  trackByTierKey(index: number, tier: any): string {
    return tier ? tier.key : index.toString();
  }

  trackByPartnerName(index: number, partner: any): string {
    return partner ? partner.name : index.toString();
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

  // Removed: a second hardcoded copy of the node list ("systemNodes") with
  // invented latency and load figures. Component health lives in
  // `infrastructureNodes`, populated from GET /api/system/nodes-health.

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
  //
  // Deleted from here: `enrolledTracks`, `selectedCourseLeaderboardTrack`,
  // `courseCycleLeaderboards`, the `activeCourseLeaderboardList` getter, plus
  // `activeTracks` and `milestoneActivity`. Every one was declared and then never
  // assigned anywhere in the codebase, so the panels bound to them ("My Enrolled
  // Courses & Tracks", "My Selected Course Leaderboard", "Active LMS Tracks") were
  // permanently empty for every user, one of them under a heading advertising a
  // scoring formula nothing computed.
  //
  // Replaced by real server state: `studentEnrolments`,
  // `studentRecentSubmissions` and `instructorCourses`.

  /** Courses the signed-in instructor owns, from GET /api/lms/my-courses. */
  instructorCourses: AuthoredCourse[] = [];
  instructorGradingQueue: GradingQueueItem[] = [];

  get instructorMentoredTeams(): any[] {
    const id = this.currentUser?.id;
    const email = (getAuthValue('activeUserEmail') || '').toLowerCase().trim();
    const name = (this.currentUser?.fullName || this.currentUser?.name || getAuthValue('activeUserName') || '').toLowerCase().trim();
    return (this.contentService.teams || []).filter(t => {
      const mId = t.mentorId || (t as any).mentor_id;
      const mName = (t.mentor || '').toLowerCase().trim();
      const mEmail = ((t as any).mentorEmail || '').toLowerCase().trim();
      return (id && mId === id) || (email && mEmail === email) || (name && mName === name);
    });
  }

  loadInstructorCourses(): void {
    if (this.activeRoleId !== 'instructor') return;
    this.apiService.getMyAuthoredCourses().subscribe({
      next: rows => {
        this.instructorCourses = rows || [];
        this.recomputeInstructorStats();
        this.cdr.markForCheck();
      },
      error: () => {
        this.instructorCourses = [];
        this.recomputeInstructorStats();
        this.cdr.markForCheck();
      }
    });

    this.apiService.getGradingQueue().subscribe({
      next: queue => {
        this.instructorGradingQueue = queue || [];
        this.recomputeInstructorStats();
        this.cdr.markForCheck();
      },
      error: () => {
        this.instructorGradingQueue = [];
        this.recomputeInstructorStats();
        this.cdr.markForCheck();
      }
    });
  }

  recomputeInstructorStats(): void {
    if (this.activeRoleId !== 'instructor') return;
    const totalCourses = this.instructorCourses.length;
    const totalStudents = this.instructorCourses.reduce((sum, c) => sum + (c.enrolled_count || 0), 0);
    const pendingGrading = this.instructorGradingQueue.length || this.instructorCourses.reduce((sum, c) => sum + (c.awaiting_grading || 0), 0);
    const mentoredTeamsCount = this.instructorMentoredTeams.length;

    this.stats = [
      { label: 'My Courses', value: String(totalCourses), icon: 'library_books', meta: `${this.instructorCourses.filter(c => c.approval_status === 'approved').length} Active & Approved`, color: 'primary' },
      { label: 'Enrolled Students', value: String(totalStudents), icon: 'group', meta: 'Across your courses', color: 'secondary' },
      { label: 'Pending Reviews', value: String(pendingGrading), icon: 'pending_actions', meta: pendingGrading > 0 ? `${pendingGrading} to grade` : 'All clear', color: 'error' },
      { label: 'Mentored Squads', value: String(mentoredTeamsCount), icon: 'co_present', meta: `${mentoredTeamsCount} Assigned teams`, color: 'tertiary' }
    ];
  }

  isUserOnline(email: string): boolean {
    if (!email || !this.authSessions || this.authSessions.length === 0) return false;
    return this.authSessions.some(s => s.email?.trim().toLowerCase() === email.trim().toLowerCase() && s.active !== false);
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
    this.contentService.addAuditLog(log);
    this.recomputeAuditState();
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
  constructor(
    public contentService: ContentService,
    private route: ActivatedRoute,
    private router: Router,
    private emailService: BrevoEmailService,
    private fileStorage: FileStorageService,
    private cdr: ChangeDetectorRef,
    public dialogService: DialogService,
    public apiService: ApiService,
    public wsSync: WsSyncService,
    private ngZone: NgZone,
    public currentUserService: CurrentUserService
  ) {
    this.restoreNavStateFromStorage();
  }

  ngOnInit(): void {
    this.contentService.refreshBackendData();
    this.loadDbData();
    this.recomputeAuditState();
    this.recomputeRoleDistribution();
    this.recomputeSchoolAdminData();
    this.activeRoleId = getAuthValue('activeRoleId') || 'student';
    // An absent role grants nothing. The !this.activeRoleId || prefix used to
    // make a missing role behave like a full administrator.
    this.canManageUsers = ['super_admin', 'admin'].includes(this.activeRoleId);
    this.loadDashboardData();
    // The greeting and role panels need the server profile. It may not have
    // arrived yet on a cold load, so re-render once it does rather than leaving
    // the user looking at a blank name.
    this.currentUserService.ensureLoaded().subscribe(profile => {
      if (profile) {
        this.loadDashboardData();
        this.loadStudentSummary();
        if (this.activeRoleId === 'student') this.loadMyTeams();
        this.loadSponsorSummary();
        this.loadInstructorCourses();
        this.cdr.markForCheck();
      }
    });
    this.loadDashboardRecords();
    this.loadAuthSessionCount();
    this.recomputeTournamentTracks();
    this.preloadLogos();

    // Read query params to set active tab & modal state reactively
    this.route.queryParams.subscribe(params => {
      let hasExplicitTab = false;
      if (params['tab'] && ['dashboard', 'overview', 'control', 'register', 'tickets', 'approvals', 'content', 'users', 'admins', 'lms', 'database'].includes(params['tab'])) {
        hasExplicitTab = true;
        this.adminTab = params['tab'] as any;
        if (this.adminTab === 'control') {
          this.adminSubTab = (params['subtab'] && ['tickets','approvals','content','users','admins','audit','users_full','personnel','mentors'].includes(params['subtab'])) ? (params['subtab'] as any) : '';
        }
        if (params['subtab'] === 'personnel') {
          this.loadPersonnel();
        }
        if (params['tab'] === 'approvals' || params['subtab'] === 'approvals') {
          this.loadApprovalsFromBackend();
        }
      }

      if (params['contentTab'] && ['stories', 'hof', 'leaderboard', 'talent', 'stats', 'news', 'countdown', 'slideshow', 'philosophy', 'events', 'pagecopy'].includes(params['contentTab'])) {
        hasExplicitTab = true;
        this.contentTab = params['contentTab'] as any;
        if (this.contentTab === 'pagecopy') {
          this.loadLandingCopyForm();
        }
      }

      if (params['category'] && ['all', 'landing', 'competitions', 'broadcast'].includes(params['category'])) {
        this.cmsCategoryFilter = params['category'] as any;
      }

      if (params['personnelRole']) {
        this.personnelTab = params['personnelRole'] as any;
      }

      if (!hasExplicitTab) {
        this.restoreNavStateFromStorage();
      } else {
        this.persistNavState();
      }

      this.isRegModalOpen = params['openRegModal'] === 'true';
      if (params['tab'] === 'roster') {
        setTimeout(() => {
          if (typeof document !== 'undefined') {
            const el = document.getElementById('school-roster-section');
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }
        }, 150);
      }
      if (params['action'] === 'add_team') {
        this.openAddTeamModal();
      }
      if (params['sponsor']) {
        const sponsorQuery = params['sponsor'].toString().toLowerCase().trim();
        const brandMatch = this.featuredBrandLogos.find(b => 
          b.name.toLowerCase().includes(sponsorQuery) || 
          b.short.toLowerCase().includes(sponsorQuery)
        );
        if (brandMatch) {
          this.openSponsorPartner(brandMatch.tierKey, brandMatch.name);
        }
      }
    });

    if (this.activeRoleId === 'super_admin') {
      this.startLiveTelemetry();
      this.loadAuthSessions();
      this.loadAuthSessionCount();
      this.loadAuditLogsFromBackend();
      this.loadSystemNodesHealth();
      this.loadSystemTelemetry();

      this.ngZone.runOutsideAngular(() => {
        const pollTimer = setInterval(() => {
          this.triggerSyncSpin();
          this.loadAuthSessions();
          this.loadAuthSessionCount();
          this.loadDashboardRecords();
          if (this.auditAutoRefresh) {
            this.loadAuditLogsFromBackend();
          }
          this.loadSystemNodesHealth();
          this.loadSystemTelemetry();
          this.cdr.markForCheck();
        }, 12000);
        this.liveIntervals.push(pollTimer);
      });

      const wsSub = this.wsSync.dataChanged$.subscribe(() => {
        this.triggerSyncSpin();
        this.loadAuthSessions();
        this.loadAuthSessionCount();
        this.loadAuditLogsFromBackend();
        this.loadDashboardRecords();
        this.loadSystemNodesHealth();
        this.loadSystemTelemetry();
        this.triggerScoringUpdatePulse();
      });
      this.liveIntervals.push({ unsubscribe: () => wsSub.unsubscribe() });

      const auditSub = this.contentService.auditLogs$.subscribe((logs) => {
        this.triggerSyncSpin();
        this.recomputeAuditState(logs);
        const auditIdx = this.stats.findIndex(s => s.label === 'Live Audit Trail');
        if (auditIdx >= 0) {
          this.stats[auditIdx] = { ...this.stats[auditIdx], value: `${(logs?.length || 0).toLocaleString()} Events` };
        }
        this.cdr.markForCheck();
      });
      this.liveIntervals.push({ unsubscribe: () => auditSub.unsubscribe() });

      if (this.contentService.countdownDate) {
        this.countdownInput = this.contentService.countdownDate.substring(0, 16);
      }
    }
  }

  ngOnDestroy(): void {
    this.liveIntervals.forEach(item => {
      if (typeof item === 'number' || typeof item === 'object') {
        if (item?.unsubscribe) item.unsubscribe();
        else clearInterval(item);
      }
    });
  }

  loadDashboardData(): void {
    // Identity comes from GET /api/users/me. It used to be looked up in
    // `contentService.users`, which is filled from the admin-only GET /api/users
    // -- so for a student, judge, sponsor or instructor `activeUser` was always
    // undefined and the greeting below read "Welcome back, Administrator".
    const me = this.currentUserService.profile();
    const activeEmail = getAuthValue('activeUserEmail') || '';
    const cachedUser = this.contentService.users.find(u =>
      u.email?.trim().toLowerCase() === activeEmail.toLowerCase() ||
      u.ticket?.trim().toUpperCase() === activeEmail.toUpperCase()
    );

    const userName = me?.full_name
      || cachedUser?.fullName
      || getAuthValue('activeUserName')
      || '';
    // Prefer the server profile; keep the cached row (admins have it) because
    // other panels still read extra fields off it.
    this.currentUser = cachedUser || (me as any) || null;

    this.currentUserService.avatar$().subscribe(avatar => {
      this.schoolAvatarUrl = avatar.url;
      this.schoolAvatarInitials = avatar.initials;
      this.cdr.markForCheck();
    });

    if (me) {
      this.schoolName = me.organization || (me.role === 'school_admin' ? me.full_name : '');
    } else if (cachedUser) {
      this.schoolName = cachedUser.organization || (cachedUser.role === 'school_admin' ? cachedUser.fullName : '');
    } else {
      this.schoolName = '';
    }

    // A school admin's mentor dropdowns need the institution's instructors, so
    // load them up front rather than only when the portal opens.
    if (this.activeRoleId === 'school_admin') {
      this.apiService.getInstitutionInstructors().subscribe({
        next: rows => { this.institutionInstructors = rows || []; this.cdr.markForCheck(); },
        error: () => { this.institutionInstructors = []; this.cdr.markForCheck(); }
      });
    }

    // Unified view of the signed-in user for the role branches below. me is the
    // server profile (available to every role); cachedUser only exists for
    // admins, who can read the full roster.
    const activeUser: any = me
      ? {
          fullName: me.full_name,
          organization: me.organization || '',
          track: me.track || '',
          role: me.role,
          email: me.email,
          ticket: me.ticket,
          tier: me.tier || '',
        }
      : cachedUser;

    switch (this.activeRoleId) {
      case 'student':
        this.dashboardTitle = 'Student Dashboard';
        this.dashboardSubtitle = `Welcome back, ${userName}. Track your learning, submissions, and competition progress.`;
        // These four cards were hardcoded literals -- "350 pts", "68%", "#12",
        // "2" with meta text "Module 4 of 8" and "1 Approved, 1 Pending" -- shown
        // identically to every student regardless of what they had actually done.
        // They are now computed from the student's real enrolments and submissions
        // (loaded by loadStudentSummary below).
        this.stats = [
          {
            label: 'Enrolled Courses',
            value: String(this.studentSummary.courses),
            icon: 'school',
            meta: this.studentSummary.courses ? 'Active enrolments' : 'Not enrolled yet',
            color: 'primary',
          },
          {
            label: 'Average Progress',
            value: this.studentSummary.courses ? `${this.studentSummary.avgProgress}%` : '--',
            icon: 'trending_up',
            meta: this.studentSummary.courses ? 'Across your courses' : 'Enrol to begin',
            color: 'secondary',
          },
          {
            label: 'Submissions',
            value: String(this.studentSummary.submissions),
            icon: 'assignment_turned_in',
            meta: `${this.studentSummary.graded} graded, ${this.studentSummary.awaiting} awaiting`,
            color: 'tertiary',
          },
          {
            label: 'Average Grade',
            value: this.studentSummary.avgGrade === null ? '--' : String(this.studentSummary.avgGrade),
            icon: 'grade',
            meta: this.studentSummary.avgGrade === null ? 'No grades yet' : 'Across graded work',
            color: 'error',
          },
        ];
        break;

      case 'instructor':
        this.dashboardTitle = 'Instructor Dashboard';
        this.dashboardSubtitle = `Welcome back, ${userName}. Manage your courses, review submissions, and mentor competition squads.`;
        this.recomputeInstructorStats();
        break;

      case 'school_admin':
        this.dashboardTitle = activeUser ? `${activeUser.organization} Admin Dashboard` : 'School Admin Dashboard';
        this.dashboardSubtitle = `Welcome back, ${userName}. NTIC Analytics & Team Management.`;
        this.recomputeSchoolAdminData();
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
          { label: 'Live Audit Trail', value: `${(this.contentService.auditLogs?.length || 0).toLocaleString()} Events`, icon: 'history', meta: 'Real-time security stream', color: 'secondary' },
          { label: 'Pending Approvals', value: String(this.pendingApprovals.length), icon: 'verified_user', meta: this.pendingApprovals.length > 0 ? 'Action required' : 'All clear', color: 'error' },
          { label: 'Active Sessions', value: String(this.authSessionCount >= 0 ? this.authSessionCount : this.registeredUsers.filter(u => u.status === 'Active').length), icon: 'groups', meta: this.activeSessionsMeta, color: 'tertiary' }
        ];
        break;
    }
  }

  loadAuthSessionCount(): void {
    if (this.activeRoleId !== 'super_admin') return;
    this.apiService.getAuthSessionsCount().subscribe({
      next: (res) => {
        this.authSessionCount = res.total;
        const tokensIdx = this.stats.findIndex(s => s.label === 'Active Sessions');
        if (tokensIdx >= 0) {
          this.stats[tokensIdx] = { ...this.stats[tokensIdx], value: String(res.total) };
        }
      },
      error: () => {}
    });
  }

  syncPendingApprovalsStat(): void {
    const count = this.pendingApprovals.length;
    const idx = this.stats.findIndex(s => s.label === 'Pending Approvals' || s.icon === 'verified_user');
    if (idx >= 0) {
      this.stats[idx] = {
        ...this.stats[idx],
        value: String(count),
        meta: count > 0 ? 'Action required' : 'All clear'
      };
    }
  }

  loadApprovalsFromBackend(): void {
    const token = getAuthValue('activeUserToken');
    const role = (getAuthValue('activeRoleId') || '').toLowerCase();
    const canView = ['admin', 'super_admin', 'support_admin', 'school_admin', 'reviewer'].includes(role);
    if (!token || !canView) return;

    this.apiService.getApprovals().subscribe({
      next: (backendApprovals: any[]) => {
        const pending: any[] = [];
        const approved: any[] = [];
        const rejected: any[] = [];
        if (backendApprovals && backendApprovals.length > 0) {
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
        }
        this.contentService.pendingApprovals = pending;
        this.contentService.approvedApprovals = approved;
        this.contentService.rejectedApprovals = rejected;
        this.syncPendingApprovalsStat();
        this.loadDashboardRecords();
      },
      error: () => {}
    });
  }

  loadAuditLogsFromBackend(): void {
    this.contentService.fetchAuditLogsFromBackend();
    this.lastAuditSyncTime = new Date();
    const auditIdx = this.stats.findIndex(s => s.label === 'Live Audit Trail');
    if (auditIdx >= 0 && this.contentService.auditLogs && this.contentService.auditLogs.length > 0) {
      this.stats[auditIdx] = { ...this.stats[auditIdx], value: `${this.contentService.auditLogs.length.toLocaleString()} Events` };
    }
  }

  // ── ADVANCED LIVE AUDIT TRAIL HELPERS (MEMOIZED FOR 60FPS SMOOTHNESS) ──
  trackByAuditLog(_index: number, item: any): any {
    return item ? (item.id || item.time || _index) : _index;
  }

  recomputeAuditState(rawLogs?: any[]): void {
    const raw = rawLogs !== undefined ? rawLogs : (this.contentService.auditLogs || []);
    this.enrichedAuditLogs = raw.map((log, index) => this.enrichSingleAuditLog(log, index));

    let auth = 0, approval = 0, content = 0, security = 0;
    const actorsSet = new Set<string>();
    const now = Date.now();
    let todayC = 0, past24hC = 0, past7dC = 0, past30dC = 0;
    const todayStr = new Date().toDateString();

    for (let i = 0; i < this.enrichedAuditLogs.length; i++) {
      const l = this.enrichedAuditLogs[i];
      if (l.category === 'auth') auth++;
      if (l.category === 'approval') approval++;
      if (l.category === 'content') content++;
      if (l.category === 'revoked' || l.severity === 'danger' || l.severity === 'warning') security++;
      if (l.user) actorsSet.add(l.user);

      const logTime = new Date(l.time).getTime();
      const diffHours = (now - logTime) / (1000 * 60 * 60);
      if (diffHours <= 24 && new Date(l.time).toDateString() === todayStr) todayC++;
      if (diffHours <= 24) past24hC++;
      if (diffHours <= 24 * 7) past7dC++;
      if (diffHours <= 24 * 30) past30dC++;
    }
    this.auditAuthCount = auth;
    this.auditApprovalCount = approval;
    this.auditContentCount = content;
    this.auditSecurityCount = security;
    this.auditTimelineTodayCount = todayC;
    this.auditTimeline24hCount = past24hC;
    this.auditTimeline7dCount = past7dC;
    this.auditTimeline30dCount = past30dC;
    this.auditUniqueActors = Array.from(actorsSet).sort();

    this.recomputeAuditFilter();
  }

  recomputeAuditFilter(): void {
    let list = this.enrichedAuditLogs;

    // Search query filter
    if (this.auditSearchQuery && this.auditSearchQuery.trim()) {
      const q = this.auditSearchQuery.trim().toLowerCase();
      list = list.filter(l =>
        (l.action && l.action.toLowerCase().includes(q)) ||
        (l.user && l.user.toLowerCase().includes(q)) ||
        (l.actorName && l.actorName.toLowerCase().includes(q)) ||
        (l.id && l.id.toLowerCase().includes(q)) ||
        (l.ip && l.ip.toLowerCase().includes(q)) ||
        (l.category && l.category.toLowerCase().includes(q)) ||
        (l.severity && l.severity.toLowerCase().includes(q)) ||
        (l.location && l.location.toLowerCase().includes(q))
      );
    }

    // Category filter
    if (this.auditCategoryFilter !== 'all') {
      list = list.filter(l => l.category === this.auditCategoryFilter);
    }

    // Severity filter
    if (this.auditSeverityFilter !== 'all') {
      list = list.filter(l => l.severity === this.auditSeverityFilter);
    }

    // User filter
    if (this.auditUserFilter !== 'all') {
      list = list.filter(l => l.user === this.auditUserFilter);
    }

    // Time filter
    if (this.auditTimeFilter !== 'all') {
      const now = Date.now();
      list = list.filter(l => {
        const logTime = new Date(l.time).getTime();
        const diffHours = (now - logTime) / (1000 * 60 * 60);
        if (this.auditTimeFilter === 'today') return diffHours <= 24 && new Date(l.time).toDateString() === new Date().toDateString();
        if (this.auditTimeFilter === '24h') return diffHours <= 24;
        if (this.auditTimeFilter === '7d') return diffHours <= 24 * 7;
        if (this.auditTimeFilter === '30d') return diffHours <= 24 * 30;
        return true;
      });
    }

    this.filteredAuditLogs = list;
    this.auditTotalPages = Math.max(1, Math.ceil(list.length / this.auditPageSize));
    if (this.auditPage > this.auditTotalPages) {
      this.auditPage = this.auditTotalPages;
    }
    if (this.auditPage < 1) {
      this.auditPage = 1;
    }

    const start = (this.auditPage - 1) * this.auditPageSize;
    this.paginatedAuditLogs = list.slice(start, start + this.auditPageSize);

    // Compute pagination range
    const total = this.auditTotalPages;
    const current = this.auditPage;
    const range: number[] = [];
    const maxButtons = 5;
    let pStart = Math.max(1, current - Math.floor(maxButtons / 2));
    let pEnd = Math.min(total, pStart + maxButtons - 1);
    if (pEnd - pStart + 1 < maxButtons) {
      pStart = Math.max(1, pEnd - maxButtons + 1);
    }
    for (let i = pStart; i <= pEnd; i++) {
      range.push(i);
    }
    this.auditPaginationRange = range;
  }

  enrichSingleAuditLog(log: any, index: number): any {
    const action = String(log.action || '').trim();
    const actionLower = action.toLowerCase();
    const rawUser = String(log.user || log.usr || 'System').trim();
    const rawTime = log.time || new Date().toISOString();

    // Determine category
    let category: 'auth' | 'approval' | 'content' | 'system' | 'ticket' | 'revoked' = 'system';
    if (log.type === 'auth' || actionLower.includes('login') || actionLower.includes('logout') || actionLower.includes('session') || actionLower.includes('password') || actionLower.includes('authenticated') || actionLower.includes('portal access')) {
      category = 'auth';
    } else if (log.type === 'approval' || actionLower.includes('approv') || actionLower.includes('verif') || actionLower.includes('reject') || actionLower.includes('accredit') || actionLower.includes('roster')) {
      category = 'approval';
    } else if (log.type === 'revoked' || actionLower.includes('delete') || actionLower.includes('remov') || actionLower.includes('revok') || actionLower.includes('ban') || actionLower.includes('terminat')) {
      category = 'revoked';
    } else if (log.type === 'ticket' || actionLower.includes('ticket') || actionLower.includes('support') || actionLower.includes('inquiry')) {
      category = 'ticket';
    } else if (actionLower.includes('story') || actionLower.includes('slide') || actionLower.includes('card') || actionLower.includes('news') || actionLower.includes('leaderboard') || actionLower.includes('talent') || actionLower.includes('course') || actionLower.includes('material') || actionLower.includes('assignment') || actionLower.includes('event')) {
      category = 'content';
    }

    // Determine severity
    let severity: 'info' | 'success' | 'warning' | 'danger' = 'info';
    if (category === 'revoked' || actionLower.includes('failed') || actionLower.includes('error') || actionLower.includes('unauthorized') || actionLower.includes('denied')) {
      severity = 'danger';
    } else if (actionLower.includes('warn') || actionLower.includes('pending') || actionLower.includes('expir') || actionLower.includes('timeout')) {
      severity = 'warning';
    } else if (category === 'approval' || actionLower.includes('success') || actionLower.includes('verified') || actionLower.includes('approved') || actionLower.includes('published') || actionLower.includes('created')) {
      severity = 'success';
    }

    // Determine icon
    let icon = 'history';
    if (category === 'auth') icon = actionLower.includes('logout') ? 'logout' : 'login';
    else if (category === 'approval') icon = actionLower.includes('reject') ? 'cancel' : 'verified_user';
    else if (category === 'revoked') icon = 'delete_forever';
    else if (category === 'ticket') icon = 'confirmation_number';
    else if (category === 'content') icon = 'article';
    else if (category === 'system') icon = 'settings';

    // Formatted ID
    const eventId = log.id ? String(log.id) : `AUD-${(100000 + index * 17 + (new Date(rawTime).getTime() % 89999)).toString().padStart(6, '0')}`;

    // Actor info & initials
    let actorEmail = rawUser;
    let actorName = rawUser;
    if (rawUser.includes('@')) {
      actorEmail = rawUser;
      const parts = rawUser.split('@')[0].split('.');
      actorName = parts.map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    }
    const actorInitials = actorName.split(' ').map((n: string) => n.charAt(0).toUpperCase()).slice(0, 2).join('') || 'NT';

    // Deterministic IP generation for realistic network tracing if not provided
    let ip = log.ip;
    if (!ip) {
      const hash = Math.abs(this.hashCode(rawUser + eventId));
      const octet2 = (hash % 150) + 50;
      const octet3 = (Math.floor(hash / 7) % 200) + 10;
      const octet4 = (Math.floor(hash / 13) % 250) + 2;
      ip = `102.${octet2}.${octet3}.${octet4}`;
    }

    // Deterministic location & client
    const location = log.location || (ip.startsWith('102') ? 'Accra, Greater Accra (GH)' : 'Kumasi, Ashanti (GH)');
    const client = log.client || (actionLower.includes('mobile') ? 'Mobile App / Android 14' : 'NTIC Web Console / Chrome 128');

    // Geo-Location flag & country code
    let flag = '🇬🇭';
    let countryCode = 'GH';
    if (ip.startsWith('102') || ip.startsWith('154') || ip.startsWith('41.')) {
      flag = '🇬🇭';
      countryCode = 'GH';
    } else if (ip.startsWith('192.') || ip.startsWith('127.') || ip.startsWith('10.') || ip.includes('localhost') || ip === '::1') {
      flag = '🏢';
      countryCode = 'Local';
    } else if (ip.startsWith('104.') || ip.startsWith('172.') || ip.startsWith('34.') || ip.startsWith('35.')) {
      flag = '🇺🇸';
      countryCode = 'US';
    } else if (ip.startsWith('185.') || ip.startsWith('194.') || ip.startsWith('51.')) {
      flag = '🇬🇧';
      countryCode = 'UK';
    }

    // Device category badge
    let deviceIcon = 'computer';
    let deviceLabel = 'Web Desktop';
    const cLower = (client || '').toLowerCase();
    if (cLower.includes('android')) {
      deviceIcon = 'android';
      deviceLabel = 'Android App';
    } else if (cLower.includes('iphone') || cLower.includes('ios')) {
      deviceIcon = 'phone_iphone';
      deviceLabel = 'iOS Device';
    } else if (cLower.includes('mobile')) {
      deviceIcon = 'smartphone';
      deviceLabel = 'Mobile Web';
    } else if (cLower.includes('bot') || cLower.includes('python') || cLower.includes('curl') || cLower.includes('agent')) {
      deviceIcon = 'smart_toy';
      deviceLabel = 'API / Agent';
    }

    return {
      ...log,
      id: eventId,
      action,
      user: rawUser,
      actorName,
      actorEmail,
      actorInitials,
      time: rawTime,
      category,
      severity,
      icon,
      ip,
      location,
      client,
      flag,
      countryCode,
      deviceIcon,
      deviceLabel,
      statusBadge: severity.toUpperCase()
    };
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  get auditTotalCount(): number {
    return (this.contentService.auditLogs || []).length;
  }

  setAuditCategory(cat: any): void {
    this.auditCategoryFilter = cat;
    this.auditPage = 1;
    this.recomputeAuditFilter();
  }

  setAuditSeverity(sev: any): void {
    this.auditSeverityFilter = sev;
    this.auditPage = 1;
    this.recomputeAuditFilter();
  }

  setAuditTime(tf: any): void {
    this.auditTimeFilter = tf;
    this.auditPage = 1;
    this.recomputeAuditFilter();
  }

  setAuditUser(usr: string): void {
    this.auditUserFilter = usr;
    this.auditPage = 1;
    this.recomputeAuditFilter();
  }

  setAuditPage(p: number): void {
    if (p >= 1 && p <= this.auditTotalPages) {
      this.auditPage = p;
      this.recomputeAuditFilter();
    }
  }

  nextAuditPage(): void {
    if (this.auditPage < this.auditTotalPages) {
      this.auditPage++;
      this.recomputeAuditFilter();
    }
  }

  prevAuditPage(): void {
    if (this.auditPage > 1) {
      this.auditPage--;
    }
  }

  resetAuditFilters(): void {
    this.auditSearchQuery = '';
    this.auditCategoryFilter = 'all';
    this.auditSeverityFilter = 'all';
    this.auditTimeFilter = 'all';
    this.auditUserFilter = 'all';
    this.auditPage = 1;
    this.showAuditToast('All filters have been reset');
  }

  refreshAuditStream(): void {
    this.auditIsRefreshing = true;
    this.lastAuditSyncTime = new Date();
    this.loadAuditLogsFromBackend();
    setTimeout(() => {
      this.auditIsRefreshing = false;
      this.showAuditToast('Audit stream synced with server');
      this.cdr.detectChanges();
    }, 600);
  }

  toggleAuditAutoRefresh(): void {
    this.auditAutoRefresh = !this.auditAutoRefresh;
    this.showAuditToast(this.auditAutoRefresh ? 'Live Auto-Stream enabled' : 'Live Auto-Stream paused');
  }

  inspectAuditLog(log: any): void {
    this.auditSelectedLog = log;
    this.auditShowJsonInInspector = false;
  }

  closeAuditInspector(): void {
    this.auditSelectedLog = null;
    this.auditShowJsonInInspector = false;
  }

  copyAuditText(text: string, label: string = 'Copied'): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        this.showAuditToast(`${label} copied to clipboard!`);
      }).catch(() => {
        this.showAuditToast(`${label} copied!`);
      });
    } else {
      this.showAuditToast(`${label} copied!`);
    }
  }

  copyAuditJson(log: any, label: string = 'JSON Payload'): void {
    if (!log) return;
    this.copyAuditText(JSON.stringify(log, null, 2), label);
  }

  showAuditToast(message: string): void {
    this.auditToastMessage = message;
    if (this.auditToastTimer) clearTimeout(this.auditToastTimer);
    this.auditToastTimer = setTimeout(() => {
      this.auditToastMessage = '';
      this.cdr.detectChanges();
    }, 2800);
    this.cdr.detectChanges();
  }

  exportAuditLogs(format: 'csv' | 'json' | 'txt'): void {
    this.auditExportDropdownOpen = false;
    const logsToExport = this.filteredAuditLogs;
    if (!logsToExport || logsToExport.length === 0) {
      this.showAuditToast('No logs matching current filter to export.');
      return;
    }

    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    let blob: Blob;
    let filename = `ntic_audit_stream_${timestampStr}.${format}`;

    if (format === 'json') {
      const jsonContent = JSON.stringify(logsToExport, null, 2);
      blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    } else if (format === 'csv') {
      const headers = ['Event ID', 'Timestamp (ISO)', 'Category', 'Severity', 'Actor Email', 'Action Description', 'IP Address', 'Location', 'Client'];
      const rows = logsToExport.map(l => [
        `"${l.id}"`,
        `"${l.time}"`,
        `"${l.category}"`,
        `"${l.severity}"`,
        `"${(l.user || '').replace(/"/g, '""')}"`,
        `"${(l.action || '').replace(/"/g, '""')}"`,
        `"${l.ip}"`,
        `"${l.location}"`,
        `"${l.client}"`
      ]);
      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
      blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    } else {
      let reportText = `========================================================================\n`;
      reportText += `       NATIONAL TECHNOLOGY & INNOVATION CHAMPIONSHIPS (NTIC)\n`;
      reportText += `           OFFICIAL REAL-TIME SECURITY & AUDIT TRAIL LOG\n`;
      reportText += `========================================================================\n\n`;
      reportText += `Exported On     : ${new Date().toLocaleString()} (UTC: ${new Date().toISOString()})\n`;
      reportText += `Exported By     : ${this.currentUser?.name || this.currentUser?.fullName || 'SuperAdmin'} (${this.activeRoleId})\n`;
      reportText += `Total Events    : ${logsToExport.length}\n`;
      reportText += `Scope Filter    : Category=${this.auditCategoryFilter}, Severity=${this.auditSeverityFilter}, Time=${this.auditTimeFilter}\n`;
      reportText += `Compliance      : Ghana Data Protection Act (Act 843) & ISO/IEC 27001 Security Stream\n\n`;
      reportText += `------------------------------------------------------------------------\n`;
      reportText += `AUDIT EVENTS RECORD:\n`;
      reportText += `------------------------------------------------------------------------\n\n`;

      logsToExport.forEach((l, i) => {
        reportText += `[#${i + 1}] ID: ${l.id} | Timestamp: ${l.time}\n`;
        reportText += `     Category   : ${l.category.toUpperCase()} | Severity: ${l.severity.toUpperCase()}\n`;
        reportText += `     Actor      : ${l.user} (${l.actorName})\n`;
        reportText += `     Action     : ${l.action}\n`;
        reportText += `     IP / Geo   : ${l.ip} - ${l.location}\n`;
        reportText += `     Client     : ${l.client}\n`;
        reportText += `------------------------------------------------------------------------\n`;
      });

      blob = new Blob([reportText], { type: 'text/plain;charset=utf-8;' });
    }

    if (typeof window !== 'undefined') {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      this.showAuditToast(`Exported ${logsToExport.length} events as .${format.toUpperCase()}`);
    }
  }

  pruneOldAuditLogs(days: number = 90, preserveCritical: boolean = true): void {
    this.auditExportDropdownOpen = false;
    const promptMsg = preserveCritical
      ? `Purge routine audit records older than ${days} days from the database? (Critical security, revoked & approval logs will remain preserved).`
      : `Purge ALL audit records older than ${days} days from the database?`;
    if (typeof window !== 'undefined' && !window.confirm(promptMsg)) {
      return;
    }
    this.apiService.pruneAuditLogs(days, preserveCritical).subscribe({
      next: (res) => {
        const msg = res.preserved_critical
          ? `Retention applied: ${res.pruned_count} routine records purged (> ${res.retained_days}d). Critical logs preserved.`
          : `Retention applied: ${res.pruned_count} records purged.`;
        this.showAuditToast(msg);
        this.loadAuditLogsFromBackend();
      },
      error: () => {
        this.showAuditToast('Failed to apply retention policy.');
      }
    });
  }

  // ── ENTITY & CREDENTIAL RECORDS ARCHIVE METHODS ──
  loadDashboardRecords(): void {
    const liveRecords: any[] = [];

    // 1. Pending approvals
    (this.contentService.pendingApprovals || []).forEach((a: any) => {
      const type = a.type === 'School Registration' ? 'school' : a.type === 'Instructor Access' ? 'instructor' : a.type === 'Team Addition' ? 'team' : 'school';
      const details: any = a.details || {};
      const entityName = a.entity || details.schoolName || details.institution || 'Pending Institution';
      const initials = entityName.split(' ').filter(Boolean).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || 'NT';
      liveRecords.push({
        id: a.id || `REC-${Math.floor(1000 + Math.random() * 9000)}`,
        type,
        title: a.entity ? `${a.entity} — ${a.type}` : a.type,
        entityName,
        initials,
        entityType: details.institution || details.school || (type === 'school' ? 'Registered School' : type === 'instructor' ? 'Lead Instructor' : 'Comp Team'),
        region: details.region || 'Greater Accra',
        district: details.district || 'Metro District',
        contactEmail: a.contact || details.contactEmail || details.email || 'admin@ntic.edu.gh',
        contactPhone: details.phone || '+233 24 000 0000',
        submittedAt: a.submitted === 'Just now' ? new Date().toISOString() : a.submitted || new Date().toISOString(),
        status: 'pending',
        statusLabel: 'Pending Audit Review',
        files: (details.docs || []).map((doc: string) => {
          const sep = doc.indexOf('::');
          return { name: sep > -1 ? doc.slice(sep + 2) : doc, fileId: sep > -1 ? doc.slice(0, sep) : '' };
        })
      });
    });

    // 2. Approved approvals
    (this.contentService.approvedApprovals || []).forEach((a: any) => {
      const type = a.type === 'School Registration' ? 'school' : a.type === 'Instructor Access' ? 'instructor' : a.type === 'Team Addition' ? 'team' : 'school';
      const details: any = a.details || {};
      const entityName = a.entity || details.schoolName || details.institution || 'Accredited Institution';
      const initials = entityName.split(' ').filter(Boolean).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || 'NT';
      liveRecords.push({
        id: a.id || `REC-${Math.floor(1000 + Math.random() * 9000)}`,
        type,
        title: a.entity ? `${a.entity} — ${a.type}` : a.type,
        entityName,
        initials,
        entityType: details.institution || details.school || (type === 'school' ? 'Accredited School' : type === 'instructor' ? 'Certified Instructor' : 'Verified Team'),
        region: details.region || 'Greater Accra',
        district: details.district || 'Metro District',
        contactEmail: a.contact || details.contactEmail || details.email || 'partner@ntic.edu.gh',
        contactPhone: details.phone || '+233 24 111 2222',
        submittedAt: a.submitted === 'Just now' ? new Date().toISOString() : a.submitted || new Date().toISOString(),
        status: 'approved',
        statusLabel: 'Approved Credential',
        files: (details.docs || []).map((doc: string) => {
          const sep = doc.indexOf('::');
          return { name: sep > -1 ? doc.slice(sep + 2) : doc, fileId: sep > -1 ? doc.slice(0, sep) : '' };
        })
      });
    });

    // 3. Rejected approvals
    (this.contentService.rejectedApprovals || []).forEach((a: any) => {
      const type = a.type === 'School Registration' ? 'school' : a.type === 'Instructor Access' ? 'instructor' : a.type === 'Team Addition' ? 'team' : 'school';
      const details: any = a.details || {};
      const entityName = a.entity || details.schoolName || details.institution || 'Flagged Record';
      const initials = entityName.split(' ').filter(Boolean).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || 'NT';
      liveRecords.push({
        id: a.id || `REC-${Math.floor(1000 + Math.random() * 9000)}`,
        type,
        title: a.entity ? `${a.entity} — ${a.type}` : a.type,
        entityName,
        initials,
        entityType: details.institution || details.school || (type === 'school' ? 'Rejected School' : type === 'instructor' ? 'Rejected Instructor' : 'Flagged Team'),
        region: details.region || 'National',
        district: details.district || '',
        contactEmail: a.contact || details.contactEmail || 'flagged@ntic.edu.gh',
        contactPhone: details.phone || '',
        submittedAt: a.submitted === 'Just now' ? new Date().toISOString() : a.submitted || new Date().toISOString(),
        status: 'rejected',
        statusLabel: 'Flagged / Rejected',
        files: []
      });
    });

    // 4. Users (judges, sponsors, instructors)
    (this.contentService.users || []).forEach((u: any) => {
      if (u.role === 'judge') {
        const initials = (u.fullName || 'Judge').split(' ').filter(Boolean).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || 'JD';
        liveRecords.push({
          id: u.id || `JDG-${Math.floor(100 + Math.random() * 900)}`,
          type: 'judge',
          title: `${u.fullName} — Official Judge`,
          entityName: u.fullName,
          initials,
          entityType: 'National Grand Jury',
          region: 'National Secretariat',
          district: 'Accra Central',
          contactEmail: u.email,
          contactPhone: u.phone || '+233 20 000 1234',
          submittedAt: u.registeredAt ? new Date(u.registeredAt).toISOString() : new Date().toISOString(),
          status: u.status?.toLowerCase() === 'active' ? 'approved' : 'pending',
          statusLabel: u.status?.toLowerCase() === 'active' ? 'Approved Credential' : 'Pending Review',
          files: []
        });
      } else if (u.role === 'sponsor') {
        const initials = (u.fullName || 'Sponsor').split(' ').filter(Boolean).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || 'SP';
        liveRecords.push({
          id: u.id || `SPN-${Math.floor(100 + Math.random() * 900)}`,
          type: 'sponsor',
          title: `${u.fullName} — Corporate Sponsor`,
          entityName: u.fullName,
          initials,
          entityType: u.organization || 'Corporate Partner',
          region: 'National',
          district: 'Headquarters',
          contactEmail: u.email,
          contactPhone: u.phone || '+233 30 200 4567',
          submittedAt: u.registeredAt ? new Date(u.registeredAt).toISOString() : new Date().toISOString(),
          status: 'approved',
          statusLabel: 'Approved Credential',
          files: []
        });
      } else if (u.role === 'instructor') {
        const initials = (u.fullName || 'Instructor').split(' ').filter(Boolean).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || 'IN';
        liveRecords.push({
          id: u.id || `INS-${Math.floor(100 + Math.random() * 900)}`,
          type: 'instructor',
          title: `${u.fullName} — Certified Mentor`,
          entityName: u.fullName,
          initials,
          entityType: u.organization || 'Lead Robotics Mentor',
          region: u.region || 'Ashanti Region',
          district: 'Kumasi Metro',
          contactEmail: u.email,
          contactPhone: u.phone || '+233 54 888 9999',
          submittedAt: u.registeredAt ? new Date(u.registeredAt).toISOString() : new Date().toISOString(),
          status: u.status?.toLowerCase() === 'active' ? 'approved' : 'pending',
          statusLabel: u.status?.toLowerCase() === 'active' ? 'Approved Credential' : 'Pending Review',
          files: []
        });
      }
    });

    // Deduplicate by ID
    const seen = new Set<string>();
    this.dashboardRecords = liveRecords.filter(r => {
      if (!r.id || seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    this.recomputeDashboardRecordsFilter();
  }

  setDashboardRecordsFilter(status: 'all' | 'approved' | 'pending' | 'rejected'): void {
    this.dashboardRecordsFilter = status;
    this.recomputeDashboardRecordsFilter();
  }

  setDashboardRecordsTypeFilter(type: 'all' | 'school' | 'instructor' | 'judge' | 'sponsor' | 'team'): void {
    this.dashboardRecordsTypeFilter = type;
    this.recomputeDashboardRecordsFilter();
  }

  recomputeDashboardRecordsFilter(): void {
    let list = this.dashboardRecords;
    if (this.dashboardRecordsFilter !== 'all') {
      list = list.filter(r => r.status === this.dashboardRecordsFilter);
    }
    if (this.dashboardRecordsTypeFilter !== 'all') {
      list = list.filter(r => r.type === this.dashboardRecordsTypeFilter);
    }
    if (this.dashboardRecordsSearch && this.dashboardRecordsSearch.trim()) {
      const q = this.dashboardRecordsSearch.toLowerCase().trim();
      list = list.filter(r =>
        (r.title && r.title.toLowerCase().includes(q)) ||
        (r.entityName && r.entityName.toLowerCase().includes(q)) ||
        (r.entityType && r.entityType.toLowerCase().includes(q)) ||
        (r.region && r.region.toLowerCase().includes(q)) ||
        (r.contactEmail && r.contactEmail.toLowerCase().includes(q)) ||
        (r.id && r.id.toLowerCase().includes(q))
      );
    }
    this.dashboardFilteredRecords = list;
  }

  inspectDashboardRecord(record: any): void {
    this.dashboardSelectedRecord = record;
    this.dashboardRecordModalOpen = true;
  }

  closeDashboardRecordModal(): void {
    this.dashboardSelectedRecord = null;
    this.dashboardRecordModalOpen = false;
  }

  openFullRecordsArchive(filter?: string): void {
    if (filter && filter !== 'all') {
      this.router.navigate(['/records'], { queryParams: { status: filter } });
    } else {
      this.router.navigate(['/records']);
    }
  }

  loadSystemNodesHealth(): void {
    if (!['super_admin', 'admin'].includes(this.activeRoleId)) return;
    this.apiService.getSystemNodesHealth().subscribe({
      next: (res: any) => {
        if (res?.nodes?.length) {
          this.infrastructureNodes = res.nodes;
        }
      },
      error: (err) => {
        // Surface it: a monitoring panel that silently shows stale data is
        // worse than one that says it cannot reach the server.
        this.telemetryError = err?.error?.detail || 'Could not load component health.';
      }
    });
  }

  loadSystemTelemetry(): void {
    if (!['super_admin', 'admin'].includes(this.activeRoleId)) return;
    this.apiService.getSystemTelemetry().subscribe({
      next: (res: any) => {
        this._telemetry = res;
        this.telemetryError = res?.rowCountsError || res?.database?.error || '';

        // Only values the server actually measured.
        const latency = res?.database?.latencyMs;
        const uptime = res?.api?.uptimeSeconds ?? 0;
        this.systemGauges = [
          {
            label: 'DB Response',
            value: typeof latency === 'number' ? latency : '--',
            color: this.latencyColor(latency),
            unit: 'ms'
          },
          {
            label: 'Active Sessions',
            value: res?.sessions?.active ?? '--',
            color: '#6366f1',
            unit: ''
          },
          {
            label: 'Live Clients',
            value: res?.realtime?.connectedClients ?? 0,
            color: '#10b981',
            unit: ''
          },
          {
            label: 'API Uptime',
            value: this.formatUptime(uptime),
            color: '#f59e0b',
            unit: ''
          }
        ];
      },
      error: (err) => {
        this.systemGauges = [];
        this.telemetryError = err?.error?.detail || 'Could not load telemetry.';
      }
    });
  }

  private latencyColor(ms: unknown): string {
    if (typeof ms !== 'number') return '#64748b';
    if (ms < 25) return '#10b981';
    if (ms < 100) return '#f59e0b';
    return '#ef4444';
  }

  private formatUptime(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  }

  refreshActiveSessionsWithToast(): void {
    this.loadAuthSessions();
    this.loadAuthSessionCount();
    setTimeout(() => {
      this.dialogService.toast('Active authentication sessions refreshed.', 'success');
    }, 600);
  }

  loadAuthSessions(): void {
    this.authSessionsError = '';
    // Guard: no stored backend token means the request will always fail with 401.
    const storedToken = getAuthValue('activeUserToken');
    if (!storedToken) {
      this.authSessionsError = 'No active session token found. Please log out and log back in to view active sessions.';
      return;
    }
    if (this.authSessions.length === 0) {
      this.authSessionsLoading = true;
    }
    this.isRefreshingSessions = true;

    this.apiService.getAuthSessions().subscribe({
      next: (sessions) => {
        this.authSessions = sessions;
        this.authSessionsLoading = false;
        this.isRefreshingSessions = false;
      },
      error: (err) => {
        this.authSessionsLoading = false;
        this.isRefreshingSessions = false;
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

  async revokeSession(userId: string): Promise<void> {
    const ok = await this.dialogService.confirm({
      title: 'Revoke Active Session',
      message: 'Are you sure you want to terminate this live user session token? The user will be signed out immediately.',
      confirmText: 'Revoke Session',
      type: 'danger'
    });
    if (!ok) return;

    this.apiService.revokeAuthSession(userId).subscribe({
      next: () => {
        this.authSessions = this.authSessions.filter(s => s.user_id !== userId);
        this.authSessionCount = Math.max(0, this.authSessionCount - 1);
        const tokensIdx = this.stats.findIndex(s => s.label === 'Active Sessions');
        if (tokensIdx >= 0) {
          this.stats[tokensIdx] = { ...this.stats[tokensIdx], value: String(this.authSessionCount) };
        }
        this.dialogService.toast('Session revoked successfully.', 'info');
      },
      error: () => {
        this.dialogService.toast('Failed to revoke session. Please try again.', 'error');
      }
    });
  }

  async revokeAllSessions(): Promise<void> {
    const ok = await this.dialogService.confirm({
      title: 'Revoke All Active Sessions',
      message: 'This will terminate ALL active user sessions across the platform except your current active admin session. Proceed?',
      confirmText: 'Revoke All Sessions',
      type: 'danger'
    });
    if (!ok) return;

    this.apiService.revokeAllSessions().subscribe({
      next: (res) => {
        // The backend already spares the caller's own session; reload from the
        // server rather than filtering by a token the API no longer exposes.
        this.loadAuthSessions();
        this.loadAuthSessionCount();
        this.dialogService.toast(`Successfully revoked ${res.revoked} active session(s).`, 'success');
      },
      error: (err) => {
        this.dialogService.toast('Failed to revoke sessions: ' + (err?.error?.detail || 'Unknown error'), 'error');
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
        this.goToSubTab('users');
      } else if (label.includes('pending approvals') || label.includes('approvals')) {
        this.goToSubTab('approvals');
      } else if (label.includes('active tokens') || label.includes('tokens') || label.includes('sessions')) {
        this.goToSubTab('tickets');
      } else if (label.includes('audit') || label.includes('logs') || label.includes('trail')) {
        this.goToSubTab('audit');
      } else if (label.includes('infrastructure') || label.includes('nodes')) {
        this.goToTab('dashboard');
      }
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 260, behavior: 'smooth' });
      }
    }
  }

  get filteredRegisteredUsers(): any[] {
    let list = this.registeredUsers;
    if (this.ticketFilter !== 'all') {
      list = list.filter(u => u.role === this.ticketFilter);
    }
    if (this.accessPassSearchQuery.trim()) {
      const q = this.accessPassSearchQuery.toLowerCase().trim();
      list = list.filter(u =>
        u.fullName?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.ticket?.toLowerCase().includes(q) ||
        u.role?.toLowerCase().includes(q) ||
        u.status?.toLowerCase().includes(q)
      );
    }
    return list;
  }

  get filteredAuthSessions(): any[] {
    let list = this.authSessions || [];
    if (this.accessPassSearchQuery.trim()) {
      const q = this.accessPassSearchQuery.toLowerCase().trim();
      list = list.filter(s =>
        s.full_name?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.role?.toLowerCase().includes(q) ||
        s.display?.toLowerCase().includes(q)
      );
    }
    return list;
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

  isMainAdmin(user: any): boolean {
    if (!user) return false;
    const currentEmail = (getAuthValue('activeUserEmail') || '').trim().toLowerCase();
    return user.role === 'super_admin' ||
           user.role === 'admin' ||
           (user.email && user.email.toLowerCase() === 'admin@ntic.edu.gh') ||
           (user.email && user.email.toLowerCase() === 'admin@ntic.org.gh') ||
           (user.email && user.email.toLowerCase().startsWith('admin@')) ||
           (user.email && user.email.toLowerCase() === currentEmail);
  }

  toggleUserStatus(user: any): void {
    if (this.isMainAdmin(user)) {
      this.dialogService.toast('Protected Account: Main Super Admin accounts cannot be modified.', 'warning');
      return;
    }
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
    if (this.isMainAdmin(user)) {
      this.dialogService.toast('Protected Account: Main Super Admin accounts cannot be modified.', 'warning');
      return;
    }
    this.apiService.resetUserPassword(user.id).subscribe({
      next: (res) => {
        const newOtp = res.otp;
        const users = this.contentService.users.map(u => {
          if (u.id === user.id) {
            return { ...u, otp: newOtp, password: newOtp, mustSetPassword: true, passwordChanged: false };
          }
          return u;
        });
        this.contentService.saveUsers(users);
        this.openCredentialsModal(
          'Password Reset',
          `New credentials for ${user.fullName || user.email}:`,
          res.ticket || user.ticket,
          res.otp,
          'Share these credentials securely with the user. They will be prompted to set a permanent password on next login.',
          ''
        );
        this.loadDashboardData();
      },
      error: () => this.dialogService.toast('Failed to reset password.', 'error')
    });
  }

  editUserFromTable(user: any): void {
    if (this.isMainAdmin(user)) {
      this.dialogService.toast('Protected Account: Main Super Admin accounts cannot be edited.', 'warning');
      return;
    }
    this.router.navigate(['/user-management'], { queryParams: { edit: user.id || user.email } });
  }

  deleteUserFromTable(user: any): void {
    if (this.isMainAdmin(user)) {
      this.dialogService.toast('Protected Account: Main Super Admin accounts cannot be deleted.', 'warning');
      return;
    }
    this.deleteUserConfirm = user;
  }

  confirmDeleteUser(): void {
    if (!this.deleteUserConfirm) return;
    const deletedId = this.deleteUserConfirm.id;
    this.apiService.deleteUser(deletedId).subscribe({
      next: () => {}, error: () => {}
    });
    const users = this.contentService.users.filter(u => u.id !== deletedId);
    this.contentService.saveUsers(users);
    this.deleteUserConfirm = null;
    this.loadDashboardData();
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
    return `NTIC-${prefix}-${this.randomSuffix()}`;
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



  async submitRegistration(): Promise<void> {
    if (!this.regForm.fullName || !this.regForm.email || !this.regForm.organization) {
      this.regError = 'Please fill in all required fields.';
      return;
    }
    if (this.registerRole === 'judge' && (!this.regForm.tracks || this.regForm.tracks.length === 0)) {
      this.regError = 'Please select at least one assigned track.';
      return;
    }
    const email = this.regForm.email.trim().toLowerCase();
    const phone = (this.regForm.phone || '').trim();

    this.regError = '';
    this.regSubmitting = true;

    // Check live availability on server before submission
    try {
      const avail = await firstValueFrom(this.apiService.checkAvailability(email, phone));
      if (avail?.email_taken) {
        this.emailValid = false;
        this.regError = `A user with email "${email}" is already registered.`;
        this.regSubmitting = false;
        return;
      }
      if (phone && avail?.phone_taken) {
        this.phoneValid = false;
        this.regError = `A user with phone number "${phone}" is already registered.`;
        this.regSubmitting = false;
        return;
      }
    } catch (_) {}

    const ticket = await this.generateTicket(this.registerRole);
    const userId = 'USR-' + Date.now().toString(36).toUpperCase();
    const newUser: any = {
      id: userId,
      role: this.registerRole,
      fullName: this.regForm.fullName,
      email: email,
      phone: phone || '',
      organization: this.regForm.organization,
      track: this.registerRole === 'judge' ? (this.regForm.tracks?.join(', ')) : undefined,
      package: this.registerRole === 'sponsor' ? this.regForm.tier : undefined,
      ticket,
      status: 'Active',
      registeredAt: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      lastLogin: 'Never'
    };
    if (this.adminRegLogoFileId) {
      newUser.logoFileId = this.adminRegLogoFileId;
      newUser.photoFileId = this.adminRegLogoFileId;
      newUser.photo_file_id = this.adminRegLogoFileId;
    }

    let otp = '';
    try {
      const apiPayload: any = {
        email: newUser.email,
        full_name: newUser.fullName,
        role: newUser.role,
        ticket: newUser.ticket,
        organization: newUser.organization || '',
        status: 'Active'
      };
      if (newUser.phone) apiPayload.phone = newUser.phone;
      if (this.adminRegLogoFileId) apiPayload.photo_file_id = this.adminRegLogoFileId;
      const created: any = await firstValueFrom(this.apiService.createUser(apiPayload));
      otp = created?.temporary_password || '';
      newUser.otp = otp;
      if (created?.ticket) {
        newUser.ticket = created.ticket;
      }
      const currentUsers = [...this.contentService.users];
      currentUsers.unshift(newUser);
      this.contentService.saveUsers(currentUsers);
    } catch (err: any) {
      this.regSubmitting = false;
      const errMsg = err?.error?.detail || err?.message || 'Failed to save account to server. Please try again.';
      this.regError = errMsg;
      this.dialogService.toast(errMsg, 'error');
      return;
    }

    const currentAudit = [...this.contentService.auditLogs];
    currentAudit.unshift({
      action: `${this.registerRole === 'judge' ? 'Judge' : 'Sponsor'} token ${newUser.ticket} generated for ${this.regForm.fullName}`,
      user: 'admin@ntic.org.gh',
      time: new Date().toISOString(),
      type: 'ticket'
    });
    this.contentService.saveAuditLogs(currentAudit);

    this.stats = this.stats.map(s =>
      s.icon === 'groups'
        ? { ...s, value: String(this.registeredUsers.length), meta: this.activeSessionsMeta }
        : s
    );

    const roleLabel = this.registerRole === 'judge' ? 'Judge' : 'Sponsor';
    this.emailService.sendApprovalEmail(
      this.regForm.email,
      this.regForm.fullName,
      this.regForm.organization || 'NTIC Competition',
      roleLabel + ' Access',
      newUser.ticket,
      otp
    );

    this.regSubmitting = false;
    this.regSuccess = true;
    this.isRegModalOpen = false;
    const userToShow = {
      ...newUser,
      photoUrl: this.adminRegLogoUrl,
      logoUrl: this.adminRegLogoUrl,
      photo_file_id: this.adminRegLogoFileId
    };
    this.showTicketModal(userToShow);

    this.regForm = { fullName: '', email: '', organization: '', phone: '', track: '', tracks: [], tier: '', notes: '' };
    this.selectedAdminPackages = [];
    this.removeAdminRegLogo();
    this.generatePreviewTicket();
    this.clearValidation();

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { openRegModal: null },
      queryParamsHandling: 'merge'
    });

    setTimeout(() => { this.regSuccess = false; }, 4000);
  }

  viewTicketUserPhotoUrl: string | null = null;

  closeTicketModal(): void {
    if (this.viewTicketUserPhotoUrl && this.viewTicketUserPhotoUrl.startsWith('blob:')) {
      this.fileStorage.revokeUrl(this.viewTicketUserPhotoUrl);
    }
    this.viewTicketUserPhotoUrl = null;
    this.viewTicketUser = null;
  }

  async showTicketModal(user: any): Promise<void> {
    this.viewTicketUser = user;
    this.viewTicketUserPhotoUrl = null;
    const fileId = user?.photo_file_id || user?.photoFileId || user?.logoFileId;
    if (fileId) {
      try {
        this.viewTicketUserPhotoUrl = await this.fileStorage.getUrl(fileId);
      } catch (_) {}
    } else if (user?.photoUrl || user?.logoUrl) {
      this.viewTicketUserPhotoUrl = user.photoUrl || user.logoUrl;
    }
    setTimeout(() => {
      if (typeof document !== 'undefined') {
        const modal = document.querySelector('.ticket-modal');
        if (modal) {
          modal.scrollTop = 0;
        }
      }
    }, 50);
  }

  copyTicket(ticket: string): void {
    if (!ticket) return;
    const otp = this.viewTicketUser?.otp || this.viewTicketUser?.temporary_password || '';
    const textToCopy = otp ? `Ticket: ${ticket}\nActivation OTP: ${otp}` : `Ticket: ${ticket}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy)
        .then(() => {
          this.copiedTicket = ticket;
          setTimeout(() => { if (this.copiedTicket === ticket) this.copiedTicket = null; }, 2000);
        })
        .catch(() => {
          this.fallbackCopyText(textToCopy);
        });
    } else {
      this.fallbackCopyText(textToCopy);
    }
  }

  resetUserPasswordFromModal(user: any): void {
    if (!user || this.isMainAdmin(user)) return;
    this.apiService.resetUserPassword(user.id).subscribe({
      next: (res) => {
        const newOtp = res.otp;
        if (this.viewTicketUser) {
          this.viewTicketUser.otp = newOtp;
          this.viewTicketUser.temporary_password = newOtp;
        }
        const users = this.contentService.users.map(u => {
          if (u.id === user.id) {
            return { ...u, otp: newOtp, password: newOtp, mustSetPassword: true, passwordChanged: false };
          }
          return u;
        });
        this.contentService.saveUsers(users);
        this.dialogService.toast('New Activation OTP generated successfully!', 'success');
      },
      error: () => this.dialogService.toast('Failed to generate new OTP.', 'error')
    });
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

  viewUserDetails(user: any): void {
    if (this.isMainAdmin(user)) {
      this.dialogService.toast('Protected Account: Main Super Admin access details cannot be viewed.', 'warning');
      return;
    }
    this.showTicketModal(user);
  }

  private approvingIds = new Set<string>();

  /**
   * Short random suffix for ticket/access-pass display codes and local record
   * ids. Uses crypto.getRandomValues rather than Math.random(), and an alphabet
   * without ambiguous characters (0/O, 1/I) so codes can be read aloud.
   *
   * This is NOT a password. Passwords come from provisionAccount().
   */
  private randomSuffix(length = 6): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
  }

  /**
   * Creates the account on the server and returns the server-minted one-time
   * password.
   *
   * Credentials must never be generated in the browser: Math.random() is
   * predictable and a 6-digit value has only 10^6 possibilities. The backend
   * uses a CSPRNG and returns the password exactly once, in
   * `temporary_password`. Send no `password` field and use what comes back.
   */
  private async provisionAccount(payload: Record<string, any>): Promise<string> {
    try {
      const created: any = await firstValueFrom(this.apiService.createUser(payload as any));
      return created?.temporary_password || '';
    } catch {
      return '';
    }
  }

  async approveRequest(req: any): Promise<void> {
    if (this.approvingIds.has(req.id)) return;
    this.approvingIds.add(req.id);

    try {
      // The server PATCH goes FIRST and is the authoritative decision: it is the
      // only thing that provisions the account, the teams and the access pass.
      //
      // saveApprovedApprovals() below bulk-syncs the row with status='approved'.
      // When that landed before this PATCH, the server saw an already-approved
      // row, skipped provisioning entirely and reported "Not an approval
      // transition" -- so the reviewer got no pass, no PIN and no error, and the
      // applicant ended up with an approved application and no account.
      let updateRes: any = null;
      let updateFailed = false;
      try {
        updateRes = await firstValueFrom(this.apiService.updateApproval(req.id, {
          status: 'approved',
          reviewed_at: new Date().toLocaleString('en-GB'),
          reviewer: getAuthValue('activeUserEmail') || 'admin@ntic.org.gh'
        }));
      } catch (err: any) {
        updateFailed = true;
        console.error('Approval update failed on server:', err);
        this.dialogService.toast(
          err?.error?.detail || 'The approval could not be recorded on the server. Nothing was changed.',
          'error'
        );
      }

      // Only move it into the approved list once the server has accepted the
      // decision, so a failed PATCH cannot leave the UI claiming an approval the
      // database never recorded.
      if (updateFailed) {
        return;
      }

      const approved = {
        ...req,
        reviewedAt: new Date().toLocaleString('en-GB'),
        reviewer: getAuthValue('activeUserEmail') || 'admin@ntic.org.gh'
      };
      const currentApproved = [...this.contentService.approvedApprovals];
      currentApproved.unshift(approved);
      this.contentService.saveApprovedApprovals(currentApproved);

      this.pendingApprovals = this.pendingApprovals.filter(r => r.id !== req.id);

      const account = updateRes?.account;
      // Only show/send credentials the server actually minted. Previously a
      // fallback Math.random() PIN and a fabricated ticket were shown and
      // emailed whenever the account already existed or the update failed,
      // handing the applicant a PIN that never worked.
      const provisioned = !!(account && account.provisioned);
      const ticket = provisioned ? (account.ticket || '') : '';
      const otp = provisioned ? (account.temporary_password || '') : '';

      // Surface every non-provisioning reason. "Not an approval transition" used
      // to be swallowed here, which is precisely what hid the race above: the
      // reviewer had no way to tell that approving had produced no account.
      if (account && account.provisioned === false && account.reason
          && !String(account.reason).startsWith('No role mapping')) {
        this.dialogService.toast(
          `Approved, but no account was created: ${account.reason}`,
          'warning'
        );
      }

      // Notify the applicant and surface credentials. The server has ALREADY
      // provisioned the account (and, for school/team applications, the teams +
      // member accounts) inside the PATCH transaction, so the client must not
      // re-create any of that -- it only notifies and then refreshes. This used
      // to fabricate local users/teams and re-POST them, which duplicated work
      // and left the two out of sync if the browser crashed or a second reviewer
      // approved via the API.
      if (provisioned) {
        this.emailService.sendApprovalEmail(req.contact, req.entity, req.entity, req.type, ticket, otp);
        this.openCredentialsModal(
          `${req.type} Approved!`,
          `Account generated for ${req.entity}. Official credentials ready below:`,
          ticket, otp, `Access credentials sent to ${req.contact}`,
          undefined,
          updateRes?.teams?.member_credentials || []
        );
      } else {
        this.emailService.sendApprovalEmail(req.contact, req.entity, req.entity, req.type, 'N/A', 'N/A');
        this.showCustomAlert(
          `${req.type} "${req.entity}" has been approved and is now live.`,
          `${req.type} Approved`, 'success'
        );
      }

      // Reconcile the local copies with the freshly-provisioned server state.
      this.contentService.refreshBackendData();

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

      this.dialogService.toast(`${req.type} approved for "${req.entity}".`, 'success');
    } finally {
      this.approvingIds.delete(req.id);
    }
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

  getSchoolStudentCount(details: any): number {
    if (!details) return 0;
    const soloCount = Array.isArray(details.students)
      ? details.students.length
      : (details.studentCount && !details.teamsList?.length ? details.studentCount : 0);
    const teams = Array.isArray(details.teamsList) ? details.teamsList : [];
    const teamMembersCount = teams.reduce((sum: number, t: any) => {
      const roster = this.getTeamMembers(t);
      return sum + (roster.length > 0 ? roster.length : 1);
    }, 0);
    const total = soloCount + teamMembersCount;
    return Math.max(total, details.studentCount || 0);
  }

  getTeamMembers(team: any): string[] {
    if (!team) return [];
    if (Array.isArray(team.rosterList) && team.rosterList.length > 0) return team.rosterList;
    if (Array.isArray(team.members) && team.members.length > 0) return team.members;
    const directNames = [team.leadName, team.member2Name, team.member3Name, team.member4Name, team.member5Name]
      .filter(Boolean)
      .map(n => String(n).trim())
      .filter(n => n.length > 0);
    if (directNames.length > 0) return directNames;

    // Cross-reference from pending / approved registrations
    const teamName = (team.name || '').trim().toLowerCase();
    if (teamName) {
      const allReqs = [...this.contentService.pendingApprovals, ...this.contentService.approvedApprovals];
      for (const req of allReqs) {
        if (req.details?.teamsList && Array.isArray(req.details.teamsList)) {
          const match = req.details.teamsList.find((t: any) => (t.name || '').trim().toLowerCase() === teamName);
          if (match) {
            const matchNames = [match.leadName, match.member2Name, match.member3Name, match.member4Name, match.member5Name]
              .filter(Boolean)
              .map(n => String(n).trim())
              .filter(n => n.length > 0);
            if (matchNames.length > 0) return matchNames;
          }
        }
      }
    }

    if (team.lead && typeof team.lead === 'string' && team.lead.trim()) {
      return [team.lead.trim()];
    }
    return [];
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

    // Persist the rejection to the backend. Previously this quick-reject only
    // mutated localStorage, so the row stayed 'pending' in PostgreSQL and every
    // other reviewer (and the applicant's public status lookup) still saw it.
    this.apiService.updateApproval(req.id, {
      status: 'rejected',
      reviewed_at: new Date().toLocaleString('en-GB'),
      reviewer: 'admin@ntic.org.gh',
      rejection_reasons: reason,
      rejection_notes: 'Rejected during preview review.'
    }).subscribe({ next: () => {}, error: () => {} });

    this.emailService.sendRejectionEmail(
      req.contact, req.entity, req.entity, req.type,
      reason, 'Rejected during preview review.'
    );

    const currentAudit = [...this.contentService.auditLogs];
    currentAudit.unshift({
      action: `${req.type} rejected (quick): ${req.entity} -- ${reason}`,
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

  /* ── Admin Management ────────────────────────────────── */
  openAdminModal(admin?: any): void {
    if (admin && this.isMainAdmin(admin)) {
      this.dialogService.toast('Protected Account: Main Super Admin accounts cannot be edited.', 'warning');
      return;
    }
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
      const newUser: any = {
        id: `USR-${String(this.contentService.users.length + 1).padStart(3, '0')}`,
        role: this.adminForm.role,
        fullName: this.adminForm.fullName,
        email: this.adminForm.email,
        phone: this.adminForm.phone || '+233 24 000 0000',
        otp: '',
        organization: this.adminForm.organization || 'NTIC',
        ticket: `NTIC-ADM-${this.randomSuffix()}`,
        status: 'Active',
        registeredAt: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        lastLogin: 'Never'
      };

      // No password field: the server mints one and returns it once.
      this.apiService.createUser({
        email: newUser.email,
        full_name: newUser.fullName,
        role: newUser.role,
        ticket: newUser.ticket,
        status: 'Active',
        phone: newUser.phone
      } as any).subscribe({
        next: (created: any) => {
          newUser.otp = created?.temporary_password || '';
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
    if (this.isMainAdmin(admin)) {
      this.dialogService.toast('Protected Account: Main Super Admin accounts cannot be deleted.', 'warning');
      return;
    }
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
      ctaLink: '#portal',
      secondaryCtaText: 'Apply Now',
      secondaryCtaLink: '/registration'
    };
    this.slideFormOpen = true;
  }

  editSlide(slide: any): void {
    this.editingSlideId = slide.id;
    this.slideForm = {
      secondaryCtaText: 'Apply Now',
      secondaryCtaLink: '/registration',
      ...slide
    };
    this.slideFormOpen = true;
  }

  closeSlideForm(): void { this.slideFormOpen = false; }

  maximizeContent(tab: string): void {
    this.contentTab = tab as any;
    this.maximizedContentTab = tab;
    this.expandedSection = true;
    if (tab === 'pagecopy') {
      this.loadLandingCopyForm();
    }
    this.persistNavState();
  }

  exitMaximize(): void {
    this.maximizedContentTab = null;
    this.expandedSection = false;
    this.persistNavState();
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
      ctaText: this.slideForm.ctaText || 'Enter Portal', ctaLink: this.slideForm.ctaLink || '#portal',
      secondaryCtaText: this.slideForm.secondaryCtaText !== undefined ? this.slideForm.secondaryCtaText : 'Apply Now',
      secondaryCtaLink: this.slideForm.secondaryCtaLink || '/registration'
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
    const fieldNames: Record<string, string> = {
      title: 'Title', description: 'Description', tag: 'Tag',
      ctaText: 'Primary CTA Text', ctaLink: 'Primary CTA Link',
      secondaryCtaText: 'Secondary CTA Text', secondaryCtaLink: 'Secondary CTA Link'
    };
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
      this.cdr.markForCheck();
    };
    updateTime();
    this.ngZone.runOutsideAngular(() => {
      const timer = setInterval(updateTime, 1000);
      this.liveIntervals.push(timer);
    });
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
  private _cachedSchoolTeams: any[] = [];
  private _cachedSchoolAdminStats: any[] = [];

  recomputeSchoolAdminData(): void {
    const activeEmail = (getAuthValue('activeUserEmail') || '').trim().toLowerCase();
    const cleanSchoolName = (this.schoolName || this.currentUser?.organization || '').trim().toLowerCase();

    // 1. Get school teams from active registry or approval records
    const myTeams = this.schoolTeams;
    const teamsCount = myTeams.length;
    
    // 2. Count registered students from roster and member records
    const studentsCount = this.schoolMembers.length;

    // 3. Count actually assigned mentors
    const assignedMentors = new Set<string>();
    myTeams.forEach(t => {
      const m = t.mentorId || t.mentor;
      if (m && m !== 'Assigned Coordinator' && m !== 'Pending NTIC allocation' && !m.includes('Pending')) {
        assignedMentors.add(m);
      }
    });
    const mentorsCount = assignedMentors.size;

    // 4. Compute actual average score from submissions if available
    const myTeamNames = new Set(myTeams.map(t => (t.name || '').trim().toLowerCase()));
    const mySubmissions = (this.contentService.submissions || []).filter((s: any) => {
      const sTeam = (s.team || s.teamName || s.student || '').trim().toLowerCase();
      const sSchool = (s.school || s.organization || '').trim().toLowerCase();
      return (sTeam && myTeamNames.has(sTeam)) || (cleanSchoolName && (sSchool === cleanSchoolName || sSchool.includes(cleanSchoolName)));
    });
    const scoredSubs = mySubmissions.filter((s: any) => typeof s.score === 'number' && s.score !== null && !isNaN(s.score));
    let avgScoreStr = '—';
    let avgScoreMeta = 'Tournament scoring pending';
    if (scoredSubs.length > 0) {
      const avg = scoredSubs.reduce((sum: number, s: any) => sum + (Number(s.score) || 0), 0) / scoredSubs.length;
      avgScoreStr = `${avg.toFixed(1)}%`;
      avgScoreMeta = `Based on ${scoredSubs.length} scored project${scoredSubs.length === 1 ? '' : 's'}`;
    }

    // 5. Look up real leaderboard standing
    const lbEntries = this.contentService.leaderboardData || [];
    const lbIndex = lbEntries.findIndex(e => {
      const eSchool = (e.schoolName || '').trim().toLowerCase();
      return cleanSchoolName && (eSchool === cleanSchoolName || eSchool.includes(cleanSchoolName) || cleanSchoolName.includes(eSchool));
    });
    let rankStr = 'Unranked';
    let rankMeta = 'Qualifiers pending';
    if (lbIndex !== -1) {
      rankStr = `#${lbIndex + 1}`;
      rankMeta = `${lbEntries[lbIndex].region || 'National'} Bracket`;
    }

    this._cachedSchoolAdminStats = [
      {
        label: 'Registered Students',
        value: studentsCount.toString(),
        icon: 'group',
        meta: `Across ${teamsCount} team${teamsCount === 1 ? '' : 's'}`,
        color: 'primary'
      },
      {
        label: 'Active Mentors',
        value: mentorsCount.toString(),
        icon: 'co_present',
        meta: mentorsCount > 0 ? `${mentorsCount} assigned` : 'Pending NTIC allocation',
        color: 'secondary'
      },
      {
        label: 'Average Score',
        value: avgScoreStr,
        icon: 'percent',
        meta: avgScoreMeta,
        color: 'tertiary'
      },
      {
        label: 'Regional Rank',
        value: rankStr,
        icon: 'workspace_premium',
        meta: rankMeta,
        color: 'error'
      }
    ];
  }

  get schoolAdminStats(): any[] {
    if (this.activeRoleId !== 'school_admin') return this.stats;
    if (!this._cachedSchoolAdminStats.length) {
      this.recomputeSchoolAdminData();
    }
    return this._cachedSchoolAdminStats;
  }

  selectedMemberProfile: any | null = null;

  openMemberProfileModal(member: any): void {
    this.selectedMemberProfile = member;
  }

  // ── Institution student portal ────────────────────────────────────
  // Backed by GET /api/institution/students and the reset-credentials and
  // mentor endpoints. Everything here is server-scoped to the caller's own
  // institution, so a school admin only ever sees or acts on their own students.
  institutionStudents: Array<{
    id: string; full_name: string; email: string; ticket: string;
    status: string; organization: string; must_change_password: boolean;
    has_logged_in: boolean;
  }> = [];
  institutionInstructors: Array<{ id: string; full_name: string; email: string; organization: string }> = [];
  institutionLoading = false;
  isPortalOpen = false;
  /** The credentials most recently issued, shown once for the institution to copy. */
  issuedCredentials: { full_name: string; email: string; temporary_password: string } | null = null;

  openInstitutionPortal(): void {
    this.isPortalOpen = true;
    this.loadInstitutionPortal();
    this.cdr.markForCheck();
  }

  closeInstitutionPortal(): void {
    this.isPortalOpen = false;
    this.issuedCredentials = null;
    this.cdr.markForCheck();
  }

  loadInstitutionPortal(): void {
    this.institutionLoading = true;
    this.cdr.markForCheck();
    this.apiService.getInstitutionStudents().subscribe({
      next: rows => {
        this.institutionStudents = rows || [];
        this.institutionLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.institutionStudents = [];
        this.institutionLoading = false;
        this.cdr.markForCheck();
      }
    });
    this.apiService.getInstitutionInstructors().subscribe({
      next: rows => {
        this.institutionInstructors = rows || [];
        this.cdr.markForCheck();
      },
      error: () => {
        this.institutionInstructors = [];
        this.cdr.markForCheck();
      }
    });
    this.loadInstitutionApprovals();
  }

  async resetStudentCredentials(student: { id: string; full_name: string }): Promise<void> {
    const ok = await this.dialogService.confirm({
      title: 'Issue New Login',
      message: `Generate a new one-time password for ${student.full_name}? Any current session is signed out, and they must set a new password on next login.`,
      confirmText: 'Generate',
      type: 'info'
    });
    if (!ok) return;
    this.apiService.resetStudentCredentials(student.id).subscribe({
      next: res => {
        // Shown once. The password is not retrievable again after this.
        this.issuedCredentials = { full_name: res.full_name, email: res.email, temporary_password: res.temporary_password };
        this.loadInstitutionPortal();
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        const detail = err?.error?.detail || 'Could not issue credentials.';
        this.dialogService.toast(detail, 'error');
        this.cdr.markForCheck();
      }
    });
  }

  dismissIssuedCredentials(): void {
    this.issuedCredentials = null;
    this.cdr.markForCheck();
  }

  async onSchoolCrestSelected(event: any): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
      this.dialogService.toast('Please select an image file.', 'error');
      return;
    }
    const id = `profile-photo-${Date.now()}`;
    await this.fileStorage.store(id, file);
    this.apiService.updateMyProfile({ photo_file_id: id }).subscribe({
      next: () => {
        this.currentUserService.refresh().subscribe(() => {
          this.loadDashboardData();
          this.dialogService.toast('School crest updated successfully!', 'success');
          this.cdr.markForCheck();
        });
      },
      error: () => {
        this.dialogService.toast('Could not save school crest.', 'error');
      }
    });
  }

  /** Assign one of this institution's instructors as a team's mentor. */
  assignMentor(teamId: string, mentorId: string): void {
    if (!mentorId) return;
    this.apiService.assignTeamMentor(teamId, mentorId).subscribe({
      next: () => {
        this.dialogService.toast('Mentor assigned.', 'success');
        this.contentService.refreshBackendData();
      },
      error: (err: any) => {
        const detail = err?.error?.detail || 'Could not assign mentor.';
        this.dialogService.toast(detail, 'error');
      }
    });
  }

  closeMemberProfileModal(): void {
    this.selectedMemberProfile = null;
  }

  get schoolTeams(): any[] {
    const activeEmail = (getAuthValue('activeUserEmail') || '').trim().toLowerCase();
    const cleanSchoolName = (this.schoolName || this.currentUser?.organization || '').trim().toLowerCase();

    const myTeams = this.contentService.teams.filter(t => {
      const cleanTeamSchool = (t.schoolName || '').trim().toLowerCase();
      const cleanLeadEmail = ((t as any).leadEmail || '').trim().toLowerCase();
      const cleanLeadName = (t.lead || '').trim().toLowerCase();
      return (cleanSchoolName && (cleanTeamSchool === cleanSchoolName || cleanTeamSchool.includes(cleanSchoolName) || cleanSchoolName.includes(cleanTeamSchool))) ||
             (activeEmail && (cleanLeadEmail === activeEmail || cleanLeadName === activeEmail));
    });
    
    // If no teams found in active registry, check pending and approved requests
    if (myTeams.length === 0) {
      const restoredTeams: any[] = [];
      const allReqs = [...this.contentService.pendingApprovals, ...this.contentService.approvedApprovals];
      allReqs.forEach(req => {
        const cleanReqSchool = (req.entity || req.details?.school || req.details?.institution || '').trim().toLowerCase();
        const cleanReqEmail = (req.contact || req.details?.email || req.details?.repEmail || '').trim().toLowerCase();
        if ((cleanSchoolName && (cleanReqSchool === cleanSchoolName || cleanReqSchool.includes(cleanSchoolName) || cleanSchoolName.includes(cleanReqSchool))) ||
            (activeEmail && cleanReqEmail === activeEmail)) {
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
                schoolName: this.schoolName || req.entity
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
              schoolName: this.schoolName || req.details?.school
            });
          }
        }
      });

      if (restoredTeams.length > 0) {
        return restoredTeams;
      }
      return [];
    }
    return myTeams;
  }

  get schoolMembers(): any[] {
    const activeEmail = (getAuthValue('activeUserEmail') || '').trim().toLowerCase();
    const activeOrg = (this.schoolName || this.currentUser?.organization || '').trim().toLowerCase();

    const memberList: any[] = [];
    const seenKeys = new Set<string>();

    const addMember = (m: any) => {
      const email = (m.email || '').trim().toLowerCase();
      const name = (m.name || m.fullName || '').trim().toLowerCase();
      const key = (name || email).trim();
      
      // Exclude school admin / representative from student competitor profiles
      if (email && email === activeEmail && this.activeRoleId === 'school_admin') {
        return;
      }
      if (m.role === 'school_admin' || m.role === 'School Admin') {
        return;
      }

      if (key && !seenKeys.has(key)) {
        seenKeys.add(key);
        memberList.push(m);
      }
    };

    // 1. Fetch registered users linked to institution
    this.contentService.users.forEach(u => {
      const uOrg = (u.organization || '').trim().toLowerCase();
      const uEmail = (u.email || '').trim().toLowerCase();
      if (u.role === 'student' || u.role === 'instructor') {
        if ((activeOrg && (uOrg === activeOrg || uOrg.includes(activeOrg) || activeOrg.includes(uOrg))) ||
            (activeEmail && uEmail === activeEmail)) {
          addMember({
            name: u.fullName || u.email,
            email: u.email,
            phone: u.phone || '',
            role: u.role === 'instructor' ? 'Mentor / Instructor' : 'Student Competitor',
            organization: u.organization || this.schoolName,
            ticket: u.ticket || '',
            track: u.track || 'General Competition',
            status: u.status || 'Active',
            registeredAt: u.registeredAt || 'Registered'
          });
        }
      }
    });

    // 2. Fetch members registered under school / team applications (has detailed member roster)
    const allReqs = [...this.contentService.pendingApprovals, ...this.contentService.approvedApprovals];
    allReqs.forEach((req: any) => {
      const reqOrg = (req.entity || req.details?.school || req.details?.institution || '').trim().toLowerCase();
      const reqEmail = (req.contact || req.details?.email || req.details?.repEmail || '').trim().toLowerCase();
      const repName = (req.details?.repName || '').trim().toLowerCase();

      if ((activeOrg && (reqOrg === activeOrg || reqOrg.includes(activeOrg) || activeOrg.includes(reqOrg))) ||
          (activeEmail && reqEmail === activeEmail)) {
        if (req.details?.students && Array.isArray(req.details.students)) {
          req.details.students.forEach((s: any) => {
            const sEmail = (s.email || '').trim().toLowerCase();
            const sName = (s.name || '').trim().toLowerCase();
            if (sEmail === reqEmail || (repName && sName === repName)) return;
            addMember({
              name: s.name,
              email: s.email || `${s.name?.toLowerCase().replace(/\s+/g, '.')}@student.ntic.edu.gh`,
              role: 'Student Competitor',
              class: s.class || 'Form 2',
              dob: s.dob || 'N/A',
              gender: s.gender || 'N/A',
              guardianName: s.guardianName || 'N/A',
              guardianPhone: s.guardianPhone || 'N/A',
              track: s.track || 'Coding & Algorithms',
              organization: req.entity || this.schoolName,
              status: 'In Competition'
            });
          });
        }
        if (req.details?.teamsList && Array.isArray(req.details.teamsList)) {
          req.details.teamsList.forEach((t: any) => {
            const roster = this.getTeamMembers(t);
            roster.forEach((memberName: string, idx: number) => {
              addMember({
                name: memberName,
                email: (idx === 0 && t.leadEmail && t.leadEmail.toLowerCase() !== reqEmail)
                  ? t.leadEmail
                  : `${memberName.toLowerCase().replace(/\s+/g, '.')}@student.ntic.edu.gh`,
                role: idx === 0 ? 'Team Lead / Captain' : 'Team Member',
                teamName: t.name,
                track: t.track || req.details?.tracks || 'Coding',
                organization: req.entity || this.schoolName,
                status: 'In Competition'
              });
            });
          });
        }
      }
    });

    // 3. Fetch members from team rosters in active registry
    this.schoolTeams.forEach((t: any) => {
      const roster = this.getTeamMembers(t);
      if (roster.length > 0) {
        roster.forEach((memberName: string, idx: number) => {
          addMember({
            name: memberName,
            email: (idx === 0 && t.leadEmail && t.leadEmail.toLowerCase() !== activeEmail)
              ? t.leadEmail
              : `${memberName.toLowerCase().replace(/\s+/g, '.')}@student.ntic.edu.gh`,
            role: idx === 0 ? 'Team Lead / Captain' : 'Team Member',
            teamName: t.name,
            track: t.track || 'Coding',
            organization: t.schoolName || this.schoolName,
            status: t.status || 'In Competition'
          });
        });
      } else if (t.lead && (!activeEmail || t.lead.toLowerCase() !== activeEmail)) {
        addMember({
          name: t.lead,
          email: `${t.lead.toLowerCase().replace(/\s+/g, '.')}@student.ntic.edu.gh`,
          role: 'Team Lead / Captain',
          teamName: t.name,
          track: t.track || 'Coding',
          organization: t.schoolName || this.schoolName,
          status: t.status || 'In Competition'
        });
      }
    });

    return memberList;
  }

  get schoolInstructors(): any[] {
    const activeOrg = (this.schoolName || this.currentUser?.organization || '').trim().toLowerCase();
    if (!activeOrg) return [];
    return this.contentService.users.filter(u => 
      u.role === 'instructor' &&
      u.organization?.trim().toLowerCase() === activeOrg
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
    this.teamForm = { id: undefined, name: '', track: 'Coding', lead: '', members: 4, mentor: '', motto: '', memberNames: ['', '', '', '', '', '', '', ''], leadEmail: '', memberEmails: ['', '', '', '', '', '', '', ''] };
    this.isAddTeamModalOpen = true;
  }

  editTeam(team: any): void {
    this.editingTeamOriginalName = team.name;
    const roster = this.getTeamMembers(team);
    const namesArray = ['', '', '', '', '', '', '', ''];
    for (let i = 1; i < roster.length && i <= 8; i++) {
      namesArray[i - 1] = roster[i];
    }

    this.teamForm = {
      id: team.id,
      name: team.name,
      track: team.track || 'Coding',
      lead: team.lead || (roster[0] || ''),
      members: Math.max(team.members || 3, roster.length),
      mentor: team.mentor || '',
      motto: team.motto || '',
      memberNames: namesArray,
      leadEmail: team.leadEmail || '',
      memberEmails: team.memberEmails?.length ? team.memberEmails : ['', '', '', '', '', '', '', '']
    };
    this.isAddTeamModalOpen = true;
  }


  async disbandTeam(team: any): Promise<void> {
    // Institutions no longer hold DELETE /api/teams -- disbanding a team is a
    // change like a rename, so it goes through approval. Admins and competition
    // managers still delete directly, since they are the ones who decide.
    const canDeleteDirectly = ['super_admin', 'admin', 'competition_manager'].includes(this.activeRoleId);

    const ok = await this.dialogService.confirm({
      title: canDeleteDirectly ? 'Disband Squad' : 'Request Disbandment',
      message: canDeleteDirectly
        ? `Are you sure you want to disband squad "${team.name}" and remove all registered student members from the tournament?`
        : `Submit a request to disband squad "${team.name}"? The squad stays in the tournament until an administrator approves it.`,
      confirmText: canDeleteDirectly ? 'Disband Squad' : 'Submit Request',
      type: 'danger'
    });
    if (!ok) return;

    if (!canDeleteDirectly) {
      if (!team.id || String(team.id).startsWith('temp-')) {
        this.dialogService.toast('This squad has not finished registering yet, so it cannot be disbanded.', 'error');
        return;
      }
      this.apiService.submitTeamChange({
        type: 'Team Disbandment',
        team_id: team.id,
        name: team.name,
        track: team.track || '',
        lead: team.lead || ''
      }).subscribe({
        next: () => {
          this.addAuditLog({
            action: `School Admin (${this.schoolName}) requested disbandment of squad: ${team.name}`,
            user: getAuthValue('activeUserEmail') || 'School Admin',
            time: new Date().toISOString(),
            type: 'approval'
          });
          this.dialogService.toast(`Disbandment request for "${team.name}" submitted for Super Admin review.`, 'success');
        },
        error: (err: any) => {
          const detail = err?.error?.detail || err?.message || 'Unknown error';
          this.dialogService.toast(
            err?.status === 0
              ? 'Could not reach the server, so the disbandment request was not submitted.'
              : `Disbandment request was not submitted: ${detail}`,
            'error'
          );
        }
      });
      return;
    }

    const deleteSuccess = () => {
      const currentTeams = this.contentService.teams.filter(t => t !== team && t.name !== team.name && t.id !== team.id);
      this.contentService.saveTeams(currentTeams);
      this.addAuditLog({
        action: `${this.getRoleLabel(this.activeRoleId)} disbanded squad: ${team.name}`,
        user: getAuthValue('activeUserEmail') || 'Administrator',
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
          const detail = err?.error?.detail || err?.message || 'Unknown error';
          this.dialogService.toast(`Failed to disband squad: ${detail}`, 'error');
        }
      });
    } else {
      deleteSuccess();
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
    if (!this.teamForm.name.trim() || !this.teamForm.lead.trim() || !this.teamForm.leadEmail?.trim()) {
      this.dialogService.toast('Team Name, Team Lead Name, and Team Lead Email are required.', 'warning');
      return;
    }

    if (!this.contentService.isValidEmail(this.teamForm.leadEmail.trim())) {
      this.dialogService.toast('Please provide a valid email address for the Team Lead.', 'warning');
      return;
    }

    const activeMembersList = [
      this.teamForm.lead.trim(),
      ...this.teamForm.memberNames
        .slice(0, (this.teamForm.members || 1) - 1)
        .map(name => name.trim())
        .filter(name => name.length > 0)
    ];

    if (this.editingTeamOriginalName) {
      // 1. EDIT MODE: Submit a formal Team Modification approval request for Super Admin review
      const existingTeam = this.contentService.teams.find(t => 
        (this.teamForm.id && t.id === this.teamForm.id) ||
        (t.name === this.editingTeamOriginalName)
      );
      const school = existingTeam?.schoolName || (this.schoolName || '').replace(/\s+Admin$/i, '').trim();
      const teamId = existingTeam?.id || this.teamForm.id;
      // No invented address. If the institution didn't enter a real email, the
      // lead stays name-only and gets an account later when the email is added
      // (provisioning runs on every edit). A guessed address used to mint a
      // login nobody could receive.
      const leadEmail = (this.teamForm.leadEmail || '').trim();
      const memberEmails = this.teamForm.memberEmails
        .slice(0, (this.teamForm.members || 1) - 1)
        .map(e => (e || '').trim())
        .filter(e => e.length > 0);
      const reqId = 'REQ-' + Date.now();

      const approvalReq: ApprovalRequest = {
        id: reqId,
        entity: `${this.editingTeamOriginalName} ➔ ${this.teamForm.name.trim()}`,
        type: 'Team Modification',
        contact: getAuthValue('activeUserEmail') || leadEmail,
        submitted: 'Modified ' + new Date().toLocaleString('en-GB'),
        details: {
          school: school,
          institution: school,
          teamId: teamId,
          originalName: this.editingTeamOriginalName,
          newName: this.teamForm.name.trim(),
          track: existingTeam?.track || this.teamForm.track,
          lead: this.teamForm.lead.trim(),
          leadName: this.teamForm.lead.trim(),
          leadEmail: leadEmail,
          memberEmails: memberEmails,
          members: activeMembersList,
          memberCount: activeMembersList.length,
          mentor: this.teamForm.mentor || '',
          motto: this.teamForm.motto || '',
          category: 'Public High School'
        }
      };

      // The server owns this request. It is the only copy that an admin can see,
      // so the local list is only updated once the write has actually succeeded
      // -- the previous version seeded localStorage first, downgraded the failure
      // to a console warning and still showed a success toast, so a request that
      // never left the browser looked submitted.
      this.apiService.submitTeamChange({
        type: 'Team Modification',
        team_id: teamId,
        name: this.teamForm.name.trim(),
        track: existingTeam?.track || this.teamForm.track,
        lead: this.teamForm.lead.trim(),
        members: activeMembersList,
        mentor: this.teamForm.mentor || '',
        motto: this.teamForm.motto || ''
      }).subscribe({
        next: (res) => {
          this.contentService.saveApprovals([
            { ...approvalReq, id: res.id, entity: res.entity || approvalReq.entity },
            ...this.contentService.pendingApprovals
          ]);
          this.addAuditLog({
            action: `School Admin (${school}) submitted Team Modification request for "${this.editingTeamOriginalName}" (New Name: "${this.teamForm.name.trim()}")`,
            user: getAuthValue('activeUserEmail') || 'School Admin',
            time: new Date().toISOString(),
            type: 'approval'
          });
          this.dialogService.toast(`Modification request for "${this.teamForm.name.trim()}" submitted for Super Admin review and approval.`, 'success');
          this.closeAddTeamModal();
        },
        error: (err: any) => {
          const detail = err?.error?.detail || err?.message || 'Unknown error';
          this.dialogService.toast(
            err?.status === 0
              ? 'Could not reach the server, so the modification request was not submitted. Check your connection and try again.'
              : `Modification request was not submitted: ${detail}`,
            'error'
          );
        }
      });
    } else {
      // 2. NEW TEAM MODE: Requires formal Super Admin approval via Team Addition request
      // No invented address -- same as the edit branch above.
      const leadEmail = (this.teamForm.leadEmail || '').trim();
      const memberEmails = this.teamForm.memberEmails
        .slice(0, (this.teamForm.members || 1) - 1)
        .map(e => (e || '').trim())
        .filter(e => e.length > 0);
      const reqId = 'REQ-' + Date.now();
      const approvalReq: ApprovalRequest = {
        id: reqId,
        entity: this.teamForm.name.trim(),
        type: 'Team Addition',
        contact: getAuthValue('activeUserEmail') || leadEmail,
        submitted: 'Registered ' + new Date().toLocaleString('en-GB'),
        details: {
          school: this.schoolName,
          institution: this.schoolName,
          track: this.teamForm.track,
          tracks: this.teamForm.track,
          lead: this.teamForm.lead.trim(),
          leadName: this.teamForm.lead.trim(),
          leadEmail: leadEmail,
          memberEmails: memberEmails,
          members: activeMembersList,
          memberCount: activeMembersList.length,
          mentor: this.teamForm.mentor || '',
          motto: this.teamForm.motto || '',
          category: 'Public High School'
        }
      };

      // Same as the modification branch: only record it locally once the server
      // has accepted it, and surface a real failure instead of a success toast.
      this.apiService.submitTeamChange({
        type: 'Team Addition',
        name: this.teamForm.name.trim(),
        track: this.teamForm.track,
        lead: this.teamForm.lead.trim(),
        members: activeMembersList,
        mentor: this.teamForm.mentor || '',
        motto: this.teamForm.motto || ''
      }).subscribe({
        next: (res) => {
          this.contentService.saveApprovals([
            { ...approvalReq, id: res.id, entity: res.entity || approvalReq.entity },
            ...this.contentService.pendingApprovals
          ]);
          this.addAuditLog({
            action: `School Admin (${this.schoolName}) requested new Team Addition: ${approvalReq.entity} (${this.teamForm.track})`,
            user: getAuthValue('activeUserEmail') || 'School Admin',
            time: new Date().toISOString(),
            type: 'approval'
          });
          this.dialogService.toast(`Team Addition "${approvalReq.entity}" submitted for Super Admin review and approval.`, 'success');
          this.closeAddTeamModal();
        },
        error: (err: any) => {
          const detail = err?.error?.detail || err?.message || 'Unknown error';
          this.dialogService.toast(
            err?.status === 0
              ? 'Could not reach the server, so the team was not submitted. Check your connection and try again.'
              : `Team Addition was not submitted: ${detail}`,
            'error'
          );
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
