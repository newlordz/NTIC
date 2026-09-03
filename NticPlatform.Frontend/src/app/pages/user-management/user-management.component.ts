import { getAuthValue } from '../../services/session.util';
import { Component, ChangeDetectionStrategy, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ContentService, User, Team } from '../../services/content.service';
import { ApiService } from '../../services/api.service';
import { ChatbotService, SupportTicket } from '../../services/chatbot.service';
import { FilterTicketsPipe } from '../../services/filter-tickets.pipe';
import { FileStorageService } from '../../services/file-storage.service';

import { SmsService } from '../../services/sms.service';
import { BrevoEmailService } from '../../services/brevo-email.service';

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [CommonModule, FormsModule, FilterTicketsPipe],
  templateUrl: './user-management.component.html',
  styleUrl: './user-management.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserManagementComponent implements OnInit, OnDestroy {
  users: User[] = [];
  filteredUsers: User[] = [];
  searchQuery = '';
  roleFilter = 'all';
  statusFilter = 'all';
  affiliationFilter: 'all' | 'institution' | 'independent' = 'all';
  selectedInstitutionFilter: string = 'all';
  viewMode: 'table' | 'grid' = 'table';
  isAddUserModalOpen = false;
  selectedUser: User | null = null;
  isDetailOpen = false;
  isEditOpen = false;
  editForm: any = {};
  userAvatarUrls: Record<string, string> = {};
  teamAvatarUrls: Record<string, string> = {};
  newUserForm: any = {
    fullName: '',
    email: '',
    phone: '',
    role: 'instructor',
    organization: 'NTIC System',
    status: 'Active',
    ticket: '',
    password: ''
  };
  formError = '';

  createdUserModal: {
    isOpen: boolean;
    user: User;
    copiedTicket: boolean;
    copiedPin: boolean;
  } | null = null;

  deleteUserConfirm: User | null = null;
  successMessage = '';
  toastTitle = '';
  toastDetail = '';

  // ── Support Center ──────────────────────────────────
  activeMainTab: 'users' | 'support' = 'users';
  selectedTicket: SupportTicket | null = null;
  adminReplyText = '';
  ticketStatusFilter: 'all' | 'open' | 'in_progress' | 'resolved' | 'recycle_bin' = 'all';

  // ── Teams & Squads State ───────────────────────────
  teams: Team[] = [];
  filteredTeams: Team[] = [];
  teamSearchQuery: string = '';
  teamTrackFilter: string = 'all';
  teamStatusFilter: string = 'all';
  deleteTeamConfirm: Team | null = null;
  isDeleteTeamLoading: boolean = false;
  isEditTeamOpen: boolean = false;
  editTeamForm: any = {};

  roleTabs = [
    { id: 'all', label: 'All Users', icon: 'group' },
    { id: 'school_admin', label: 'School Admins', icon: 'school' },
    { id: 'student', label: 'Students', icon: 'person' },
    { id: 'teams', label: 'Teams & Squads', icon: 'groups' },
    { id: 'instructor', label: 'Instructors', icon: 'badge' },
    { id: 'judge', label: 'Judges', icon: 'gavel' },
    { id: 'sponsor', label: 'Sponsors', icon: 'handshake' },
    { id: 'content_manager', label: 'Content Mgrs', icon: 'edit_note' },
    { id: 'reviewer', label: 'Reviewers', icon: 'rate_review' },
    { id: 'competition_manager', label: 'Comp. Mgrs', icon: 'emoji_events' },
    { id: 'super_admin', label: 'Admins', icon: 'admin_panel_settings' },
  ];

  constructor(
    public contentService: ContentService,
    private apiService: ApiService,
    private router: Router,
    private route: ActivatedRoute,
    public chatbotService: ChatbotService,
    private http: HttpClient,
    private fileStorage: FileStorageService,
    public smsService: SmsService,
    public emailService: BrevoEmailService
  , private cdr: ChangeDetectorRef) {}

  get canManageUsers(): boolean {
    const role = (getAuthValue('activeRoleId') || '').toLowerCase();
    // An absent role grants nothing, and only real admins may manage users --
    // the backend requires super_admin/admin, so showing controls to anyone
    // else just produced 403s.
    return role === 'super_admin' || role === 'admin';
  }

  isCurrentUser(user: User): boolean {
    const email = getAuthValue('activeUserEmail') || '';
    return user.email === email;
  }

  isMainAdmin(user: User | null): boolean {
    if (!user) return false;
    return user.role === 'super_admin' || 
           user.role === 'admin' ||
           user.email === 'admin@ntic.edu.gh' || 
           user.email === 'admin@ntic.org.gh' || 
           user.email.startsWith('admin@') || 
           this.isCurrentUser(user);
  }

  ngOnInit(): void {
    if (!this.canManageUsers) {
      this.router.navigate(['/dashboard']);
      return;
    }
    this.loadUsers();
    this.loadTeams();
    this.loadTickets();

    this.queryParamsSub = this.route.queryParams.subscribe(params => {
      if (params['edit']) {
        const query = String(params['edit']).toLowerCase();
        const found = this.users.find(u => String(u.id).toLowerCase() === query || u.email.toLowerCase() === query);
        if (found) {
          this.editUser(found);
        }
      }
    });
    this.cdr.markForCheck();
  }

  loadTickets(): void {
    this.chatbotService.loadAllTickets();
    this.chatbotService.loadRecycleBinTickets();
    if (!this.ticketRefreshTimer) {
      this.ticketRefreshTimer = setInterval(() => {
        this.chatbotService.loadAllTickets();
        this.chatbotService.loadRecycleBinTickets();
      }, 10000);
    }
  }

  ngOnDestroy(): void {
    if (this.ticketRefreshTimer) {
      clearInterval(this.ticketRefreshTimer);
      this.ticketRefreshTimer = null;
    }
    // route.queryParams never completes, so without this the subscription
    // outlived the component and kept the whole instance reachable.
    this.queryParamsSub?.unsubscribe();
  }

  isSyncing = false;

  syncAccounts(showToastNotice = true): void {
    this.isSyncing = true;
    this.http.get<any[]>(`${environment.apiUrl}/users`).subscribe({
      next: (backendUsers) => {
        const existingLookup: Record<string, any> = {};
        for (const u of this.contentService.users) {
          existingLookup[u.id] = u;
        }
        const mapped: User[] = (backendUsers || []).map((u: any) => {
          const existing = existingLookup[u.id];
          return {
            id: u.id,
            email: u.email,
            fullName: u.full_name || 'Unknown',
            phone: u.phone || '',
            otp: existing?.otp || '',
            password: existing?.password || '',
            mustSetPassword: existing?.mustSetPassword || false,
            passwordChanged: existing?.passwordChanged,
            organization: u.organization || '',
            role: u.role || 'student',
            ticket: u.ticket || '',
            status: (u.status || 'active').toLowerCase() === 'suspended' ? 'Suspended' : ((u.status || 'active').toLowerCase() === 'pending' ? 'Pending' : 'Active'),
            registeredAt: u.created_at || '',
            lastLogin: existing?.lastLogin || ''
          };
        });

        // Filter out any stale synthetic squad ghost entries
        const cleanUsers = mapped.filter(u => !u.email?.endsWith('@squad.ntic.org.gh') && !u.ticket?.startsWith('NTIC-SQD-'));

        this.contentService.users = cleanUsers;
        try {
          localStorage.setItem('ntic_users', JSON.stringify(cleanUsers));
        } catch {}
        this.users = [...cleanUsers];
        this.applyFilters();
        this.loadAvatars();
        this.isSyncing = false;
        if (showToastNotice) {
          this.showToast('Accounts Synced', `Successfully synchronized ${cleanUsers.length} accounts from backend database.`);
        }
      },
      error: () => {
        const fallback = [...this.contentService.users].filter(u => !u.email?.endsWith('@squad.ntic.org.gh') && !u.ticket?.startsWith('NTIC-SQD-'));
        this.users = fallback;
        this.applyFilters();
        this.loadAvatars();
        this.isSyncing = false;
        if (showToastNotice) {
          this.showToast('Sync Notice', 'Backend sync unavailable. Loaded cached user accounts.', 4000);
        }
      }
    });
  }

  isPurging = false;

  purgeTestData(): void {
    if (!this.canManageUsers) return;
    const confirmed = window.confirm(
      'Are you sure you want to PURGE ALL TEST DATA?\n\nThis will permanently delete all test teams, students, submissions, approvals, and non-admin user accounts from PostgreSQL. Only your Super Admin account will remain.'
    );
    if (!confirmed) return;

    this.isPurging = true;
    this.apiService.purgeTestData().subscribe({
      next: (res) => {
        this.isPurging = false;
        this.contentService.clearAllData();
        this.teams = [];
        this.users = [];
        this.syncAccounts(false);
        this.showToast('Database Purged', res?.message || 'Database successfully cleared of test records.', 5000);
      },
      error: (err) => {
        this.isPurging = false;
        this.showToast('Purge Failed', err?.error?.detail || err?.message || 'Could not purge database.', 5000);
      }
    });
  }

  loadUsers(): void {
    this.apiService.getTeams().subscribe({
      next: (backendTeams) => {
        this.teams = (backendTeams || []).map((t: any) => ({
          id: t.id,
          name: t.name,
          track: t.track || 'General',
          lead: t.lead || 'Unassigned',
          members: t.members || 1,
          status: t.status || 'Active',
          schoolName: t.school_name || t.schoolName || '',
          school_name: t.school_name || t.schoolName || '',
          mentor: t.mentor || '',
          mentorId: t.mentorId || t.mentor_id || null,
          mentorStatus: t.mentorStatus || t.mentor_status || 'none',
          motto: t.motto || '',
          rosterList: t.rosterList || [],
          competitionId: t.competition_id || t.competitionId || null,
          photoFileId: t.photoFileId || t.photo_file_id || t.logoFileId || t.logo_file_id
        }));
        this.syncAccounts(false);
      },
      error: () => {
        this.teams = [...this.contentService.teams];
        this.syncAccounts(false);
      }
    });
  }

  async loadAvatars(): Promise<void> {
    // 1. Resolve direct user profile photos
    for (const u of this.users) {
      if (this.userAvatarUrls[u.id]) continue;
      const explicitPhoto = (u as any).avatarUrl || (u as any).photo_url || (u as any).image;
      if (explicitPhoto) {
        this.userAvatarUrls[u.id] = explicitPhoto;
        continue;
      }
      const fileId = u.photoFileId || (u as any).profilePhotoFileId || (u as any).photo_file_id;
      if (fileId) {
        try {
          const url = await this.fileStorage.getUrl(fileId);
          if (url) this.userAvatarUrls[u.id] = url;
        } catch { }
      }
    }

    // 2. Cross-reference approvals and registrations
    const allApprovals = [
      ...this.contentService.approvedApprovals,
      ...this.contentService.pendingApprovals
    ];
    for (const req of allApprovals) {
      const contact = (req.contact || '').toLowerCase();
      const entity = (req.entity || '').toLowerCase();
      const fileId = req.details?.photoFileId || req.details?.logoFileId || (req.details?.memberPhotos?.[0]);
      if (!fileId) continue;
      
      for (const u of this.users) {
        if (this.userAvatarUrls[u.id]) continue;
        if (u.email.toLowerCase() === contact || u.fullName.toLowerCase().includes(entity) || entity.includes(u.fullName.toLowerCase())) {
          try {
            const url = await this.fileStorage.getUrl(fileId);
            if (url) this.userAvatarUrls[u.id] = url;
          } catch { }
        }
      }
    }

    // 3. Resolve team logos/photos
    for (const t of this.teams) {
      const teamKey = t.id || t.name;
      if (this.teamAvatarUrls[teamKey]) continue;
      const fileId = t.logoFileId || t.photoFileId || (t as any).logo_file_id || (t as any).photo_file_id;
      if (fileId) {
        try {
          const url = await this.fileStorage.getUrl(fileId);
          if (url) this.teamAvatarUrls[teamKey] = url;
        } catch { }
      } else if ((t as any).photo_url || (t as any).logo_url || (t as any).image) {
        this.teamAvatarUrls[teamKey] = (t as any).photo_url || (t as any).logo_url || (t as any).image;
      }
    }
  }

  getUserAvatarUrl(u: User | null): string {
    if (!u || !u.id) return '';
    return this.userAvatarUrls[u.id] || '';
  }

  getTeamAvatarUrl(t: Team | null): string {
    if (!t) return '';
    return this.teamAvatarUrls[t.id || t.name] || '';
  }

  applyFilters(): void {
    let list = [...this.users];
    if (this.roleFilter !== 'all') {
      list = list.filter(u => u.role === this.roleFilter);
    }
    if (this.statusFilter !== 'all') {
      list = list.filter(u => u.status.toLowerCase() === this.statusFilter);
    }
    if (this.affiliationFilter === 'institution') {
      list = list.filter(u => u.role === 'student' && this.isInstitutionStudent(u));
    } else if (this.affiliationFilter === 'independent') {
      list = list.filter(u => u.role === 'student' && !this.isInstitutionStudent(u));
    }
    if (this.selectedInstitutionFilter !== 'all') {
      const targetInst = this.selectedInstitutionFilter.toLowerCase();
      list = list.filter(u =>
        (u.role === 'student' && this.getStudentOrganization(u).toLowerCase() === targetInst) ||
        (u.organization && u.organization.trim().toLowerCase() === targetInst)
      );
    }
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(u =>
        u.fullName?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.organization?.toLowerCase().includes(q) ||
        this.getStudentOrganization(u).toLowerCase().includes(q) ||
        this.getUserOrganizationDisplay(u).toLowerCase().includes(q) ||
        u.ticket?.toLowerCase().includes(q) ||
        u.phone?.toLowerCase().includes(q) ||
        this.getStudentTeam(u)?.name?.toLowerCase().includes(q)
      );
    }
    this.filteredUsers = list;
  }

  setAffiliationFilter(filter: 'all' | 'institution' | 'independent'): void {
    this.affiliationFilter = filter;
    if (filter !== 'institution') {
      this.selectedInstitutionFilter = 'all';
    }
    this.applyFilters();
  }

  setSelectedInstitutionFilter(inst: string): void {
    this.selectedInstitutionFilter = inst;
    this.applyFilters();
  }

  isInstitutionStudent(u: User): boolean {
    if (!u || u.role !== 'student') return false;
    const org = (u.organization || '').trim().toLowerCase();
    const fullNameLower = (u.fullName || '').trim().toLowerCase();
    const ignored = ['', 'ntic platform', 'independent', 'open registration', '_pending_profile', 'none', 'n/a', fullNameLower];
    if (org && !ignored.includes(org)) {
      return true;
    }
    const team = this.getStudentTeam(u);
    if (team) {
      const teamSchool = (team.schoolName || team.school_name || '').trim().toLowerCase();
      if (teamSchool && !['registered institution', 'independent', 'none', '', fullNameLower].includes(teamSchool)) {
        return true;
      }
    }
    return false;
  }

  getStudentOrganization(u: User): string {
    if (!u) return '';
    const org = (u.organization || '').trim();
    const fullNameLower = (u.fullName || '').trim().toLowerCase();
    const ignored = ['', 'ntic platform', 'independent', 'open registration', '_pending_profile', 'none', 'n/a', fullNameLower];
    if (org && !ignored.includes(org.toLowerCase())) {
      return org;
    }
    const team = this.getStudentTeam(u);
    if (team) {
      const teamSchool = (team.schoolName || team.school_name || '').trim();
      if (teamSchool && !['registered institution', 'independent', 'none', '', fullNameLower].includes(teamSchool.toLowerCase())) {
        return teamSchool;
      }
    }
    return '';
  }

  getUserOrganizationDisplay(u: User): string {
    if (!u) return '';
    const org = (u.organization || '').trim();
    const isSelfName = org.toLowerCase() === (u.fullName || '').trim().toLowerCase();
    if (org && !isSelfName && !['ntic platform', 'independent', 'open registration', '_pending_profile'].includes(org.toLowerCase())) {
      return org;
    }
    // Platform-level personnel and educators default to 'NTIC System'
    if (['super_admin', 'admin', 'instructor', 'content_manager', 'reviewer', 'competition_manager'].includes(u.role)) {
      return 'NTIC System';
    }
    if (u.role === 'student') {
      return this.getStudentOrganization(u) || 'Independent';
    }
    if (u.role === 'judge') {
      return (org && !isSelfName) ? org : 'Independent / NTIC Panel';
    }
    return (org && !isSelfName) ? org : 'Independent';
  }

  getStudentTeam(u: User): Team | undefined {
    if (!u) return undefined;
    const nameLower = (u.fullName || '').trim().toLowerCase();
    const emailLower = (u.email || '').trim().toLowerCase();
    return this.teams.find(t => {
      const leadMatch = (t.lead && (t.lead.toLowerCase() === nameLower || t.lead.toLowerCase() === emailLower));
      if (leadMatch) return true;
      if (Array.isArray(t.rosterList) && t.rosterList.some((m: any) => typeof m === 'string' && (m.toLowerCase().includes(nameLower) || (emailLower && m.toLowerCase().includes(emailLower))))) {
        return true;
      }
      if (Array.isArray(t.memberNames) && t.memberNames.some((m: any) => typeof m === 'string' && (m.toLowerCase().includes(nameLower) || (emailLower && m.toLowerCase().includes(emailLower))))) {
        return true;
      }
      if (Array.isArray(t.memberList) && t.memberList.some((m: any) => typeof m === 'string' && (m.toLowerCase().includes(nameLower) || (emailLower && m.toLowerCase().includes(emailLower))))) {
        return true;
      }
      return false;
    });
  }

  get knownInstitutions(): string[] {
    const instSet = new Set<string>();
    for (const u of this.users) {
      if (u.role === 'school_admin' && u.organization) {
        const org = u.organization.trim();
        const selfName = (u.fullName || '').trim().toLowerCase();
        if (org && !['ntic platform', 'independent', 'open registration', selfName].includes(org.toLowerCase())) {
          instSet.add(org);
        }
      }
      if (u.role === 'student') {
        const org = this.getStudentOrganization(u);
        if (org && org.toLowerCase() !== (u.fullName || '').trim().toLowerCase()) instSet.add(org);
      }
    }
    for (const t of this.teams) {
      const s = (t.schoolName || t.school_name || '').trim();
      if (s && !['registered institution', 'independent'].includes(s.toLowerCase())) {
        instSet.add(s);
      }
    }
    return Array.from(instSet).sort((a, b) => a.localeCompare(b));
  }

  getInstitutionStudentCount(): number {
    return this.users.filter(u => u.role === 'student' && this.isInstitutionStudent(u)).length;
  }

  getIndependentStudentCount(): number {
    return this.users.filter(u => u.role === 'student' && !this.isInstitutionStudent(u)).length;
  }

  jumpToTeam(teamName: string): void {
    if (!teamName) return;
    this.closeDetail();
    this.setRoleTab('teams');
    this.teamSearchQuery = teamName;
    this.applyTeamFilters();
  }

  setRoleTab(role: string): void {
    this.roleFilter = role;
    if (role === 'teams') {
      this.applyTeamFilters();
    } else {
      this.applyFilters();
    }
  }

  getRoleCount(role: string): number {
    if (role === 'all') return this.users.length;
    if (role === 'teams') return this.teams.length;
    return this.users.filter(u => u.role === role).length;
  }

  getActiveCount(): number {
    return this.users.filter(u => (u.status || '').toLowerCase() === 'active').length;
  }

  getSuspendedCount(): number {
    return this.users.filter(u => (u.status || '').toLowerCase() === 'suspended').length;
  }

  setNewUserRole(role: string): void {
    const prefixMap: Record<string, string> = {
      instructor: 'NTIC-MTR-',
      school_admin: 'NTIC-SCH-',
      content_manager: 'NTIC-CNT-',
      reviewer: 'NTIC-REV-',
      competition_manager: 'NTIC-CMP-',
      admin: 'NTIC-ADM-'
    };
    const prefix = prefixMap[role] || 'NTIC-USR-';
    // Display code only. The account password is minted by the server.
    this.newUserForm.role = role;
    this.newUserForm.ticket = prefix + this.randomSuffix();
    this.newUserForm.password = '';
    if (role === 'instructor' && !this.newUserForm.organization) {
      this.newUserForm.organization = 'NTIC System';
    }
  }

  /**
   * Short random code for display tickets and local ids, using
   * crypto.getRandomValues. This is NOT a password - passwords are generated
   * server-side and returned in `temporary_password`.
   */
  private randomSuffix(length = 6): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
  }

  // ── Modal Keyboard Accessibility & Focus Trapping ────
  @HostListener('document:keydown.escape', ['$event'])
  handleEscapeKey(event: KeyboardEvent): void {
    if (this.createdUserModal?.isOpen) {
      this.closeCreatedUserModal();
      event.preventDefault();
      return;
    }
    if (this.isAddUserModalOpen) {
      this.closeAddUserModal();
      event.preventDefault();
      return;
    }
    if (this.isDetailOpen) {
      this.closeDetail();
      event.preventDefault();
      return;
    }
    if (this.deleteUserConfirm) {
      this.cancelDelete();
      event.preventDefault();
      return;
    }
    if (this.isEditOpen) {
      this.closeEdit();
      event.preventDefault();
      return;
    }
    if (this.deleteTeamConfirm) {
      this.closeDeleteTeamModal();
      event.preventDefault();
      return;
    }
    if (this.isEditTeamOpen) {
      this.closeEditTeamModal();
      event.preventDefault();
      return;
    }
  }

  @HostListener('document:keydown.tab', ['$event'])
  handleTabFocusTrap(event: KeyboardEvent): void {
    const activeModal = document.querySelector(
      '.um-modal-backdrop:not([style*="display: none"]) .um-modal, .ca-backdrop:not([style*="display: none"]) .ca-panel'
    ) as HTMLElement;
    if (!activeModal) return;

    const focusable = activeModal.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable || focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey) {
      if (document.activeElement === first || !activeModal.contains(document.activeElement)) {
        last.focus();
        event.preventDefault();
      }
    } else {
      if (document.activeElement === last || !activeModal.contains(document.activeElement)) {
        first.focus();
        event.preventDefault();
      }
    }
  }

  private autoFocusModal(preferredSelector?: string): void {
    setTimeout(() => {
      const activeModal = document.querySelector(
        '.um-modal-backdrop:not([style*="display: none"]) .um-modal, .ca-backdrop:not([style*="display: none"]) .ca-panel'
      ) as HTMLElement;
      if (!activeModal) return;

      if (preferredSelector) {
        const target = activeModal.querySelector<HTMLElement>(preferredSelector);
        if (target) {
          target.focus();
          return;
        }
      }

      const firstInputOrBtn = activeModal.querySelector<HTMLElement>(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button.cmd-btn-primary, button.ca-btn-submit, button:not([disabled])'
      );
      if (firstInputOrBtn) {
        firstInputOrBtn.focus();
      }
    }, 60);
  }

  openAddUserModal(defaultRole = 'instructor'): void {
    this.formError = '';
    this.newUserForm = {
      fullName: '',
      email: '',
      phone: '',
      role: defaultRole,
      organization: defaultRole === 'instructor' ? 'NTIC System' : '',
      status: 'Active',
      ticket: '',
      password: ''
    };
    this.setNewUserRole(defaultRole);
    this.isAddUserModalOpen = true;
    this.autoFocusModal('input[type="text"]');
  }

  closeAddUserModal(): void {
    this.isAddUserModalOpen = false;
    this.formError = '';
  }

  openCreatedUserModal(user: User): void {
    this.createdUserModal = {
      isOpen: true,
      user,
      copiedTicket: false,
      copiedPin: false
    };
    this.autoFocusModal('.cmd-btn-primary, .btn-cred-copy');
  }

  closeCreatedUserModal(): void {
    this.createdUserModal = null;
  }

  copyCreatedUserText(type: 'ticket' | 'pin'): void {
    if (!this.createdUserModal) return;
    let text = '';
    if (type === 'ticket') {
      text = this.createdUserModal.user.ticket || '';
      this.createdUserModal.copiedTicket = true;
      setTimeout(() => { if (this.createdUserModal) this.createdUserModal.copiedTicket = false; }, 2500);
    } else {
      text = this.createdUserModal.user.otp || '';
      this.createdUserModal.copiedPin = true;
      setTimeout(() => { if (this.createdUserModal) this.createdUserModal.copiedPin = false; }, 2500);
    }
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
    }
  }

  saveNewUser(): void {
    this.formError = '';
    if (!this.newUserForm.fullName || !this.newUserForm.fullName.trim()) {
      this.formError = 'Please enter the user\'s Full Name.';
      this.showToast('Validation Error', 'Full Name is required.', 4000);
      return;
    }
    if (!this.newUserForm.email || !this.newUserForm.email.trim()) {
      this.formError = 'Please enter a valid Email Address.';
      this.showToast('Validation Error', 'Email Address is required.', 4000);
      return;
    }
    if (this.contentService.isEmailTaken(this.newUserForm.email.trim())) {
      this.formError = `The email "${this.newUserForm.email}" is already registered to another account.`;
      this.showToast('Email Taken', `The email ${this.newUserForm.email} is already registered.`, 4500);
      return;
    }

    if (!this.newUserForm.ticket) {
      this.setNewUserRole(this.newUserForm.role || 'judge');
    }

    const newId = 'USR-' + Date.now() + '-' + this.randomSuffix(4).toLowerCase();
    const newUser: User = {
      id: newId,
      role: this.newUserForm.role,
      fullName: this.newUserForm.fullName,
      email: this.newUserForm.email,
      phone: this.newUserForm.phone || '',
      organization: this.newUserForm.organization || '',
      ticket: this.newUserForm.ticket,
      otp: '',
      mustSetPassword: true,
      passwordChanged: false,
      status: this.newUserForm.status || 'Active',
      registeredAt: new Date().toLocaleDateString('en-GB'),
      lastLogin: 'Never'
    };

    const userPayload = {
      id: newId,
      email: newUser.email,
      full_name: newUser.fullName,
      role: newUser.role,
      status: newUser.status,
      ticket: newUser.ticket,
      organization: newUser.organization || (newUser.role === 'instructor' ? 'NTIC System' : ''),
      // Deliberately no `password`. The server generates a strong one with a
      // CSPRNG and returns it once as `temporary_password`. The old code sent a
      // Math.random() 6-digit value, falling back to the literal '123456'.
      phone: newUser.phone || ''
    };

    // Create the account FIRST, then use the server-issued password. Notifying
    // the user before the write succeeded meant sending credentials for an
    // account that might not exist.
    this.http.post(`${environment.apiUrl}/users`, userPayload).subscribe({
      next: (created: any) => {
        newUser.otp = created?.temporary_password || '';

        if (newUser.phone) {
          this.smsService.sendCredentialsSms(newUser.phone, newUser.fullName, newUser.ticket || '', newUser.otp || '').subscribe();
        }
        this.emailService.sendApprovalEmail(
          newUser.email,
          newUser.fullName,
          newUser.organization || 'NTIC Platform',
          newUser.role,
          newUser.ticket || '',
          newUser.otp || ''
        );

        const currentUsers = [...this.contentService.users];
        currentUsers.unshift(newUser);
        this.contentService.saveUsers(currentUsers);
        this.closeAddUserModal();
        this.openCreatedUserModal(newUser);
        this.loadUsers();
      },
      error: (err) => {
        this.formError = err?.error?.detail || 'Could not create the account. Please try again.';
        this.showToast('Error', this.formError, 5000);
      }
    });
  }

  viewUser(user: User): void {
    this.selectedUser = user;
    this.isDetailOpen = true;
    this.autoFocusModal('.cmd-btn-ghost');
  }

  closeDetail(): void {
    this.isDetailOpen = false;
    this.selectedUser = null;
  }

  editUser(user: User): void {
    this.showToast('Editing Restricted', 'User details can only be edited by the account owner via Profile Settings.', 4000);
  }

  closeEdit(): void {
    this.isEditOpen = false;
    this.editForm = {};
  }

  showToast(title: string, detail: string = '', duration: number = 3000): void {
    this.toastTitle = title;
    this.toastDetail = detail;
    this.successMessage = title;
    setTimeout(() => { this.successMessage = ''; this.toastTitle = ''; this.toastDetail = ''; }, duration);
  }

  saveEdit(): void {
    if (!this.canManageUsers) return;
    if (this.isMainAdmin(this.editForm)) {
      this.showToast('Protected Account', 'Main Super Admin accounts cannot be edited or modified.', 4000);
      this.closeEdit();
      return;
    }
    if (this.editForm.email && this.contentService.isEmailTaken(this.editForm.email, this.editForm.id)) {
      this.showToast('Email Taken', `The email ${this.editForm.email} is already registered to another user account.`, 4500);
      return;
    }
    const userId = this.editForm.id;
    this.http.patch(`${environment.apiUrl}/users/${userId}`, {
      email: this.editForm.email,
      full_name: this.editForm.fullName,
      role: this.editForm.role,
      status: this.editForm.status,
      ticket: this.editForm.ticket,
      password: this.editForm.password || '',
      phone: this.editForm.phone || ''
    }).subscribe({
      next: () => {
        const users = [...this.contentService.users];
        const idx = users.findIndex(u => u.id === userId);
        if (idx > -1) {
          users[idx] = { ...users[idx], ...this.editForm };
          this.contentService.saveUsers(users);
        }
        this.showToast('User Updated', `${this.editForm.fullName} has been updated.`);
        this.closeEdit();
        this.loadUsers();
      },
      error: (err) => {
        console.error('Failed to update user in backend:', err);
        this.showToast('Error', 'Failed to update user in backend database.', 4000);
      }
    });
  }

  toggleStatus(user: User): void {
    if (this.isMainAdmin(user)) return;
    const prevStatus = user.status;
    const isActive = (user.status || '').toLowerCase() === 'active';
    const newStatus = isActive ? 'Suspended' : 'Active';

    // 1. Instant Optimistic UI Update (0ms)
    user.status = newStatus;
    const localIdx = this.contentService.users.findIndex(u => u.id === user.id);
    if (localIdx > -1) {
      this.contentService.users[localIdx].status = newStatus;
      this.contentService.saveUsers(this.contentService.users);
    }
    this.applyFilters();
    this.cdr?.markForCheck?.();
    this.showToast('Status Changed', `${user.fullName} is now ${newStatus}.`);

    // 2. Background Persistence to Backend Database
    this.http.patch(`${environment.apiUrl}/users/${user.id}`, {
      email: user.email,
      full_name: user.fullName,
      role: user.role,
      status: newStatus,
      ticket: user.ticket,
      phone: user.phone || ''
    }).subscribe({
      next: () => {
        // Successfully persisted in PostgreSQL
      },
      error: (err) => {
        // Rollback optimistic update on error
        user.status = prevStatus;
        if (localIdx > -1) {
          this.contentService.users[localIdx].status = prevStatus;
          this.contentService.saveUsers(this.contentService.users);
        }
        this.applyFilters();
        this.cdr?.markForCheck?.();
        console.error('Failed to change user status in backend:', err);
        this.showToast('Error', 'Failed to update user status in backend database.', 4000);
      }
    });
  }

  deleteUser(user: User): void {
    if (this.isMainAdmin(user)) {
      this.showToast('Protected Account', 'Main Super Admin accounts cannot be deleted.', 4000);
      return;
    }
    this.deleteUserConfirm = user;
    this.autoFocusModal('.cmd-btn-danger, .cmd-btn-ghost');
  }

  confirmDelete(): void {
    if (!this.deleteUserConfirm) return;
    const userToDelete = this.deleteUserConfirm;

    // Check if this user is a squad
    const matchingTeam = this.teams.find(t => t.id === userToDelete.id || (t.name && userToDelete.fullName.includes(t.name)));
    if (matchingTeam && matchingTeam.id) {
      this.apiService.deleteTeam(matchingTeam.id).subscribe({
        next: () => {
          this.teams = this.teams.filter(t => t.id !== matchingTeam.id);
          this.showToast('Squad Deleted', `${userToDelete.fullName} has been removed.`);
          this.deleteUserConfirm = null;
          this.loadUsers();
        },
        error: (err) => {
          this.showToast('Error', err?.error?.detail || 'Failed to delete squad.', 4000);
          this.deleteUserConfirm = null;
        }
      });
      return;
    }

    this.http.delete(`${environment.apiUrl}/users/${userToDelete.id}`).subscribe({
      next: () => {
        const users = this.contentService.users.filter(u => u.id !== userToDelete.id);
        this.contentService.saveUsers(users);
        this.showToast('User Deleted', `${userToDelete.fullName} has been removed.`);
        this.deleteUserConfirm = null;
        this.loadUsers();
      },
      error: (err) => {
        console.error('Failed to delete user in backend:', err);
        this.showToast('Error', 'Failed to delete user from backend database.', 4000);
        this.deleteUserConfirm = null;
      }
    });
  }

  cancelDelete(): void {
    this.deleteUserConfirm = null;
  }

  regenerateOTP(user: User): void {
    // Check if this is a team squad account
    const matchingTeam = this.teams.find(t => t.id === user.id || (t.name && user.fullName.includes(t.name)));
    if (matchingTeam && matchingTeam.id) {
      this.regenerateTeamOTP(matchingTeam);
      return;
    }

    // Delegate to the dedicated endpoint: it mints the password with a CSPRNG
    // and revokes the user's existing sessions at the same time.
    this.http.post<{ temporary_password?: string; otp?: string }>(
      `${environment.apiUrl}/users/${user.id}/reset-password`, {}
    ).subscribe({
      next: (res) => {
        const newOTP = res?.temporary_password || res?.otp || '';
        const users = [...this.contentService.users];
        const idx = users.findIndex(u => u.id === user.id);
        if (idx > -1) {
          users[idx].otp = newOTP;
          users[idx].mustSetPassword = true;
          users[idx].passwordChanged = false;
          this.contentService.saveUsers(users);
        }
        this.openCreatedUserModal({
          ...user,
          otp: newOTP
        });
        this.showToast('Password Reset', `A new one-time password was generated for ${user.fullName}.`, 6000);
        this.loadUsers();
      },
      error: (err) => {
        console.error('Failed to reset the password in the backend:', err);
        this.showToast('Error', 'Failed to reset the password in the backend database.', 4000);
      }
    });
  }

  toggleTeamStatus(team: Team): void {
    const prevStatus = team.status;
    const isActive = (team.status || '').toLowerCase() === 'active';
    const newStatus = isActive ? 'Suspended' : 'Active';

    // 1. Instant Optimistic UI Update (0ms)
    team.status = newStatus;
    this.applyTeamFilters();
    this.cdr?.markForCheck?.();
    this.showToast('Squad Status Changed', `${team.name} is now ${newStatus}.`);

    // 2. Background Persistence
    this.apiService.updateTeam(team.id || '', { status: newStatus }).subscribe({
      next: () => {
        // Persisted
      },
      error: (err) => {
        team.status = prevStatus;
        this.applyTeamFilters();
        this.cdr?.markForCheck?.();
        this.showToast('Error', err?.error?.detail || 'Failed to update squad status.', 4000);
      }
    });
  }

  regenerateTeamOTP(team: Team): void {
    const newPass = 'NTIC-' + this.randomSuffix(6);
    this.apiService.updateTeam(team.id || '', { motto: newPass }).subscribe({
      next: () => {
        const uIdx = this.users.findIndex(u => u.id === team.id || (team.name && u.fullName.includes(team.name)));
        if (uIdx > -1) {
          this.users[uIdx].otp = newPass;
        }
        this.openCreatedUserModal({
          id: team.id || '',
          email: `${team.name.toLowerCase().replace(/[^a-z0-9]/g, '')}@squad.ntic.org.gh`,
          fullName: `${team.name} (${team.lead || 'Squad Lead'})`,
          phone: '',
          role: 'student',
          organization: team.schoolName || team.school_name || 'Independent',
          ticket: `NTIC-SQD-${(team.id || '0000').slice(-4).toUpperCase()}`,
          status: team.status || 'Active',
          otp: newPass,
          registeredAt: '',
          lastLogin: ''
        });
        this.showToast('Credentials Reset', `New access pass generated for ${team.name}.`, 5000);
      },
      error: (err) => {
        this.showToast('Error', err?.error?.detail || 'Failed to reset credentials for squad.', 4000);
      }
    });
  }


  getInitials(name: string): string {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??';
  }

  getRoleLabel(role: string): string {
    const map: Record<string, string> = {
      super_admin: 'Super Admin', admin: 'Admin', content_manager: 'Content Manager',
      reviewer: 'Reviewer', competition_manager: 'Competition Manager',
      school_admin: 'School Admin', instructor: 'Instructor', student: 'Student',
      judge: 'Judge', sponsor: 'Sponsor'
    };
    return map[role] || role;
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
    const map: Record<string, string> = {
      super_admin: 'admin_panel_settings', admin: 'shield', content_manager: 'edit_note',
      reviewer: 'rate_review', competition_manager: 'emoji_events',
      school_admin: 'school', instructor: 'badge', student: 'person',
      judge: 'gavel', sponsor: 'handshake'
    };
    return map[role] || 'person';
  }

  exportCSV(): void {
    const headers = ['Name', 'Email', 'Phone', 'Role', 'Organization', 'Ticket', 'OTP', 'Status', 'Registered'];
    const rows = this.filteredUsers.map(u => [
      u.fullName, u.email, u.phone, this.getUserRoleLabel(u), u.organization, u.ticket, u.otp, u.status, u.registeredAt
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ntic-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  private ticketRefreshTimer: any = null;
  /** Held so ngOnDestroy can unsubscribe; route params never complete. */
  private queryParamsSub?: Subscription;

  // ── Support Center Methods ──────────────────────────────────────────
  setActiveMainTab(tab: 'users' | 'support'): void {
    this.activeMainTab = tab;
    if (tab === 'support') {
      this.loadTickets();
    }
  }

  // ── Teams & Squads Management Methods ──────────────────────────────
  loadTeams(): void {
    this.apiService.getTeams().subscribe({
      next: (backendTeams) => {
        this.teams = (backendTeams || []).map((t: any) => ({
          id: t.id,
          name: t.name,
          track: t.track || 'General',
          lead: t.lead || 'Unassigned',
          members: t.members || 1,
          status: t.status || 'Active',
          schoolName: t.school_name || t.schoolName || '',
          school_name: t.school_name || t.schoolName || '',
          mentor: t.mentor || '',
          mentorId: t.mentorId || t.mentor_id || null,
          mentorStatus: t.mentorStatus || t.mentor_status || 'none',
          motto: t.motto || '',
          rosterList: t.rosterList || [],
          competitionId: t.competition_id || t.competitionId || null
        }));
        this.applyTeamFilters();
      },
      error: () => {
        this.teams = [...this.contentService.teams];
        this.applyTeamFilters();
      }
    });
  }

  applyTeamFilters(): void {
    let list = [...this.teams];
    if (this.teamTrackFilter !== 'all') {
      list = list.filter(t => (t.track || '').toLowerCase() === this.teamTrackFilter.toLowerCase());
    }
    if (this.teamStatusFilter !== 'all') {
      list = list.filter(t => (t.status || '').toLowerCase() === this.teamStatusFilter.toLowerCase());
    }
    if (this.teamSearchQuery.trim()) {
      const q = this.teamSearchQuery.toLowerCase();
      list = list.filter(t =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.schoolName || t.school_name || '').toLowerCase().includes(q) ||
        (t.lead || '').toLowerCase().includes(q) ||
        (t.mentor || '').toLowerCase().includes(q) ||
        (t.track || '').toLowerCase().includes(q)
      );
    }
    this.filteredTeams = list;
  }

  setTeamTrackFilter(track: string): void {
    this.teamTrackFilter = track;
    this.applyTeamFilters();
  }

  setTeamStatusFilter(status: string): void {
    this.teamStatusFilter = status;
    this.applyTeamFilters();
  }

  get instructorsList(): User[] {
    return this.users.filter(u => (u.role || '').toLowerCase() === 'instructor');
  }

  openDeleteTeamModal(team: Team): void {
    this.deleteTeamConfirm = team;
    this.autoFocusModal('button.cmd-btn:not(.cmd-btn-ghost)');
  }

  closeDeleteTeamModal(): void {
    this.deleteTeamConfirm = null;
    this.isDeleteTeamLoading = false;
  }

  confirmDeleteTeam(): void {
    if (!this.deleteTeamConfirm || !this.deleteTeamConfirm.id) return;
    this.isDeleteTeamLoading = true;
    const teamId = this.deleteTeamConfirm.id;
    const teamName = this.deleteTeamConfirm.name;

    this.apiService.deleteTeam(teamId).subscribe({
      next: () => {
        this.teams = this.teams.filter(t => t.id !== teamId);
        this.contentService.teams = this.contentService.teams.filter(t => t.id !== teamId);
        this.applyTeamFilters();
        this.closeDeleteTeamModal();
        this.showToast('Team Deleted', `Squad "${teamName}" was permanently removed.`);
      },
      error: (err) => {
        this.isDeleteTeamLoading = false;
        this.showToast('Deletion Failed', err?.error?.detail || 'Could not delete squad.', 5000);
      }
    });
  }

  openEditTeamModal(team: Team): void {
    this.editTeamForm = {
      id: team.id,
      name: team.name,
      track: team.track,
      lead: team.lead,
      members: team.members,
      school_name: team.schoolName || team.school_name,
      status: team.status || 'Active',
      motto: team.motto || '',
      mentorId: team.mentorId || ''
    };
    this.isEditTeamOpen = true;
    this.autoFocusModal('input.ca-input');
  }

  closeEditTeamModal(): void {
    this.isEditTeamOpen = false;
    this.editTeamForm = {};
  }

  saveEditTeam(): void {
    if (!this.editTeamForm.id || !this.editTeamForm.name.trim()) return;
    const payload = {
      name: this.editTeamForm.name.trim(),
      track: this.editTeamForm.track,
      lead: this.editTeamForm.lead,
      members: Number(this.editTeamForm.members) || 1,
      school_name: this.editTeamForm.school_name,
      status: this.editTeamForm.status,
      motto: this.editTeamForm.motto
    };

    this.apiService.updateTeam(this.editTeamForm.id, payload).subscribe({
      next: () => {
        const idx = this.teams.findIndex(t => t.id === this.editTeamForm.id);
        if (idx !== -1) {
          this.teams[idx] = {
            ...this.teams[idx],
            ...payload,
            schoolName: payload.school_name
          };
          this.applyTeamFilters();
        }
        this.closeEditTeamModal();
        this.showToast('Team Updated', `Squad "${payload.name}" updated successfully.`);
      },
      error: (err) => {
        this.showToast('Update Failed', err?.error?.detail || 'Could not update squad.', 5000);
      }
    });
  }

  assignTeamMentor(team: Team, mentorId: string): void {
    const mId = mentorId ? mentorId : null;
    const mentorUser = this.users.find(u => u.id === mId);
    this.apiService.assignTeamMentor(team.id || '', mId).subscribe({
      next: () => {
        team.mentorId = mId;
        team.mentor = mentorUser ? mentorUser.fullName : '';
        team.mentorStatus = mId ? 'assigned' : 'none';
        this.showToast('Mentor Assigned', mentorUser ? `Assigned ${mentorUser.fullName} to ${team.name}.` : `Unassigned mentor from ${team.name}.`);
      },
      error: (err) => {
        this.showToast('Mentor Update Failed', err?.error?.detail || 'Failed to update mentor.', 4000);
      }
    });
  }

  get filteredTickets(): SupportTicket[] {
    if (this.ticketStatusFilter === 'recycle_bin') {
      return this.chatbotService.recycleBinTickets();
    }
    const tickets = this.chatbotService.supportTickets();
    if (this.ticketStatusFilter === 'all') return tickets;
    return tickets.filter(t => t.status === this.ticketStatusFilter);
  }

  selectTicket(ticket: SupportTicket): void {
    this.selectedTicket = ticket;
    this.adminReplyText = '';
  }

  closeTicketPanel(): void {
    this.selectedTicket = null;
    this.adminReplyText = '';
  }

  sendAdminReply(): void {
    if (!this.adminReplyText.trim() || !this.selectedTicket) return;
    const agentName = getAuthValue('activeUserEmail') || 'Support Agent';
    this.chatbotService.addAdminReply(this.selectedTicket.id, agentName, this.adminReplyText.trim());
    this.adminReplyText = '';
    this.showToast('Reply Sent', 'Your response has been delivered to the user.');
  }

  resolveTicket(ticket: SupportTicket): void {
    this.chatbotService.resolveTicket(ticket.id);
    this.showToast('Ticket Resolved', `Ticket ${ticket.id} has been marked as resolved.`);
    if (this.selectedTicket?.id === ticket.id) {
      this.closeTicketPanel();
    }
  }

  async deleteTicket(ticket: SupportTicket): Promise<void> {
    const ok = await this.chatbotService.deleteTicket(ticket.id);
    if (ok) {
      this.showToast('Moved to Recycle Bin', `Ticket ${ticket.id} was moved to Recycle Bin.`);
      if (this.selectedTicket?.id === ticket.id) {
        this.closeTicketPanel();
      }
    }
  }

  async restoreTicket(ticket: SupportTicket): Promise<void> {
    const ok = await this.chatbotService.restoreTicket(ticket.id);
    if (ok) {
      this.showToast('Ticket Restored', `Ticket ${ticket.id} restored to active list.`);
      if (this.selectedTicket?.id === ticket.id) {
        this.closeTicketPanel();
      }
    }
  }

  async permanentlyDeleteTicket(ticket: SupportTicket): Promise<void> {
    if (confirm(`Are you sure you want to PERMANENTLY delete ticket ${ticket.id}? This action cannot be undone.`)) {
      const ok = await this.chatbotService.permanentlyDeleteTicket(ticket.id);
      if (ok) {
        this.showToast('Permanently Deleted', `Ticket ${ticket.id} was permanently purged.`);
        if (this.selectedTicket?.id === ticket.id) {
          this.closeTicketPanel();
        }
      }
    }
  }

  async emptyRecycleBin(): Promise<void> {
    if (confirm('Are you sure you want to permanently delete ALL tickets in the Recycle Bin?')) {
      const ok = await this.chatbotService.emptyRecycleBin();
      if (ok) {
        this.showToast('Recycle Bin Emptied', 'All recycled support tickets were permanently purged.');
        if (this.selectedTicket?.isDeleted) {
          this.closeTicketPanel();
        }
      }
    }
  }

  getTicketStatusClass(status: string): string {
    return { open: 'status-open', in_progress: 'status-in-progress', resolved: 'status-resolved' }[status] || '';
  }
}
