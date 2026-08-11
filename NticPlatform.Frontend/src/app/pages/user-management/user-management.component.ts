import { getAuthValue } from '../../services/session.util';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ContentService, User } from '../../services/content.service';
import { ChatbotService, SupportTicket } from '../../services/chatbot.service';
import { FilterTicketsPipe } from '../../services/filter-tickets.pipe';

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [CommonModule, FormsModule, FilterTicketsPipe],
  templateUrl: './user-management.component.html',
  styleUrl: './user-management.component.scss'
})
export class UserManagementComponent implements OnInit, OnDestroy {
  users: User[] = [];
  filteredUsers: User[] = [];
  searchQuery = '';
  roleFilter = 'all';
  statusFilter = 'all';
  viewMode: 'table' | 'grid' = 'table';
  isAddUserModalOpen = false;
  selectedUser: User | null = null;
  isDetailOpen = false;
  isEditOpen = false;
  editForm: any = {};
  newUserForm: any = {
    fullName: '',
    email: '',
    phone: '',
    role: 'judge',
    organization: '',
    status: 'Active',
    ticket: '',
    password: ''
  };
  deleteUserConfirm: User | null = null;
  successMessage = '';
  toastTitle = '';
  toastDetail = '';

  // ── Support Center ──────────────────────────────────
  activeMainTab: 'users' | 'support' = 'users';
  selectedTicket: SupportTicket | null = null;
  adminReplyText = '';
  ticketStatusFilter: 'all' | 'open' | 'in_progress' | 'resolved' | 'recycle_bin' = 'all';

  roleTabs = [
    { id: 'all', label: 'All Users', icon: 'group' },
    { id: 'school_admin', label: 'School Admins', icon: 'school' },
    { id: 'student', label: 'Students', icon: 'person' },
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
    private router: Router,
    private route: ActivatedRoute,
    public chatbotService: ChatbotService,
    private http: HttpClient
  ) {}

  get canManageUsers(): boolean {
    const role = getAuthValue('activeRoleId') || '';
    return role === 'super_admin' || role === 'support_admin';
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
    this.loadTickets();

    this.route.queryParams.subscribe(params => {
      if (params['edit']) {
        const query = String(params['edit']).toLowerCase();
        const found = this.users.find(u => String(u.id).toLowerCase() === query || u.email.toLowerCase() === query);
        if (found) {
          this.editUser(found);
        }
      }
    });
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
  }

  isSyncing = false;

  syncAccounts(showToastNotice = true): void {
    this.isSyncing = true;
    this.http.get<any[]>(`${environment.apiUrl}/users`).subscribe({
      next: (backendUsers) => {
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
        this.contentService.users = mapped;
        this.contentService.saveUsers(mapped);
        this.users = [...mapped];
        this.applyFilters();
        this.isSyncing = false;
        if (showToastNotice) {
          this.showToast('Accounts Synced', `Successfully synchronized ${mapped.length} accounts from backend database.`);
        }
      },
      error: () => {
        this.users = [...this.contentService.users];
        this.applyFilters();
        this.isSyncing = false;
        if (showToastNotice) {
          this.showToast('Sync Notice', 'Backend sync unavailable. Loaded cached user accounts.', 4000);
        }
      }
    });
  }

  loadUsers(): void {
    this.syncAccounts(false);
  }

  applyFilters(): void {
    let list = [...this.users];
    if (this.roleFilter !== 'all') {
      list = list.filter(u => u.role === this.roleFilter);
    }
    if (this.statusFilter !== 'all') {
      list = list.filter(u => u.status.toLowerCase() === this.statusFilter);
    }
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(u =>
        u.fullName?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.organization?.toLowerCase().includes(q) ||
        u.ticket?.toLowerCase().includes(q) ||
        u.phone?.toLowerCase().includes(q)
      );
    }
    this.filteredUsers = list;
  }

  setRoleTab(role: string): void {
    this.roleFilter = role;
    this.applyFilters();
  }

  getRoleCount(role: string): number {
    if (role === 'all') return this.users.length;
    return this.users.filter(u => u.role === role).length;
  }

  getActiveCount(): number {
    return this.users.filter(u => u.status === 'Active').length;
  }

  getSuspendedCount(): number {
    return this.users.filter(u => u.status === 'Suspended').length;
  }

  openAddUserModal(defaultRole = 'judge'): void {
    const prefix = defaultRole === 'judge' ? 'NTIC-JDG-' : defaultRole === 'sponsor' ? 'NTIC-SPO-' : defaultRole === 'school_admin' ? 'NTIC-SCH-' : 'NTIC-USR-';
    const randomTicket = prefix + Math.random().toString(36).substring(2, 6).toUpperCase();
    const randomOtp = Math.floor(100000 + Math.random() * 900000).toString();
    this.newUserForm = {
      fullName: '',
      email: '',
      phone: '',
      role: defaultRole,
      organization: '',
      status: 'Active',
      ticket: randomTicket,
      password: randomOtp
    };
    this.isAddUserModalOpen = true;
  }

  closeAddUserModal(): void {
    this.isAddUserModalOpen = false;
  }

  saveNewUser(): void {
    if (!this.canManageUsers) return;
    if (!this.newUserForm.fullName || !this.newUserForm.email) {
      this.showToast('Validation Error', 'Full Name and Email are required.', 4000);
      return;
    }
    if (this.contentService.isEmailTaken(this.newUserForm.email)) {
      this.showToast('Email Taken', `The email ${this.newUserForm.email} is already registered.`, 4500);
      return;
    }

    const newId = 'USR-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    const userPayload = {
      id: newId,
      email: this.newUserForm.email,
      full_name: this.newUserForm.fullName,
      role: this.newUserForm.role,
      status: this.newUserForm.status || 'Active',
      ticket: this.newUserForm.ticket,
      password: this.newUserForm.password || '123456',
      phone: this.newUserForm.phone || ''
    };

    this.http.post(`${environment.apiUrl}/users`, userPayload).subscribe({
      next: () => {
        const newUser: User = {
          id: newId,
          role: this.newUserForm.role,
          fullName: this.newUserForm.fullName,
          email: this.newUserForm.email,
          phone: this.newUserForm.phone || '',
          organization: this.newUserForm.organization || '',
          ticket: this.newUserForm.ticket,
          otp: this.newUserForm.password,
          status: this.newUserForm.status || 'Active',
          registeredAt: new Date().toLocaleDateString('en-GB'),
          lastLogin: 'Never'
        };
        const currentUsers = [...this.contentService.users];
        currentUsers.unshift(newUser);
        this.contentService.saveUsers(currentUsers);
        this.showToast('Account Created!', `${newUser.fullName} (${this.getRoleLabel(newUser.role)}) created successfully.`);
        this.closeAddUserModal();
        this.loadUsers();
      },
      error: (err) => {
        console.error('Failed to save user in backend:', err);
        const newUser: User = {
          id: newId,
          role: this.newUserForm.role,
          fullName: this.newUserForm.fullName,
          email: this.newUserForm.email,
          phone: this.newUserForm.phone || '',
          organization: this.newUserForm.organization || '',
          ticket: this.newUserForm.ticket,
          otp: this.newUserForm.password,
          status: this.newUserForm.status || 'Active',
          registeredAt: new Date().toLocaleDateString('en-GB'),
          lastLogin: 'Never'
        };
        const currentUsers = [...this.contentService.users];
        currentUsers.unshift(newUser);
        this.contentService.saveUsers(currentUsers);
        this.showToast('Account Created!', `${newUser.fullName} (${this.getRoleLabel(newUser.role)}) created.`);
        this.closeAddUserModal();
        this.loadUsers();
      }
    });
  }

  viewUser(user: User): void {
    this.selectedUser = user;
    this.isDetailOpen = true;
  }

  closeDetail(): void {
    this.isDetailOpen = false;
    this.selectedUser = null;
  }

  editUser(user: User): void {
    if (this.isMainAdmin(user)) {
      this.showToast('Protected Account', 'Main Super Admin accounts cannot be edited or modified.', 4000);
      return;
    }
    this.editForm = { ...user };
    this.isEditOpen = true;
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
    const newStatus = user.status === 'Active' ? 'Suspended' : 'Active';
    this.http.patch(`${environment.apiUrl}/users/${user.id}`, {
      email: user.email,
      full_name: user.fullName,
      role: user.role,
      status: newStatus,
      ticket: user.ticket,
      phone: user.phone || ''
    }).subscribe({
      next: () => {
        const users = [...this.contentService.users];
        const idx = users.findIndex(u => u.id === user.id);
        if (idx > -1) {
          users[idx].status = newStatus;
          this.contentService.saveUsers(users);
        }
        this.showToast('Status Changed', `${user.fullName} is now ${newStatus}.`);
        this.loadUsers();
      },
      error: (err) => {
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
  }

  confirmDelete(): void {
    if (!this.deleteUserConfirm) return;
    const userToDelete = this.deleteUserConfirm;
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
    const newOTP = Math.floor(100000 + Math.random() * 900000).toString();
    this.http.patch(`${environment.apiUrl}/users/${user.id}`, {
      email: user.email,
      full_name: user.fullName,
      role: user.role,
      status: user.status,
      ticket: user.ticket,
      password: newOTP
    }).subscribe({
      next: () => {
        const users = [...this.contentService.users];
        const idx = users.findIndex(u => u.id === user.id);
        if (idx > -1) {
          users[idx].otp = newOTP;
          users[idx].password = newOTP;
          this.contentService.saveUsers(users);
        }
        this.showToast('OTP Regenerated', `New OTP generated for ${user.fullName}.`, 6000);
        this.loadUsers();
      },
      error: (err) => {
        console.error('Failed to regenerate OTP in backend:', err);
        this.showToast('Error', 'Failed to regenerate OTP in backend database.', 4000);
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

  // ── Support Center Methods ──────────────────────────────────────────
  setActiveMainTab(tab: 'users' | 'support'): void {
    this.activeMainTab = tab;
    if (tab === 'support') {
      this.loadTickets();
    }
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
