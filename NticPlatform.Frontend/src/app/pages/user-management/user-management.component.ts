import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContentService, User } from '../../services/content.service';

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-management.component.html',
  styleUrl: './user-management.component.scss'
})
export class UserManagementComponent implements OnInit {
  users: User[] = [];
  filteredUsers: User[] = [];
  searchQuery = '';
  roleFilter = 'all';
  statusFilter = 'all';
  selectedUser: User | null = null;
  isDetailOpen = false;
  isEditOpen = false;
  editForm: any = {};
  deleteUserConfirm: User | null = null;
  successMessage = '';
  toastTitle = '';
  toastDetail = '';

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

  constructor(public contentService: ContentService) {}

  get canManageUsers(): boolean {
    const role = localStorage.getItem('activeRoleId') || '';
    return role === 'super_admin';
  }

  isCurrentUser(user: User): boolean {
    const email = localStorage.getItem('activeUserEmail') || '';
    return user.email === email;
  }

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.users = [...this.contentService.users];
    this.applyFilters();
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

  viewUser(user: User): void {
    this.selectedUser = user;
    this.isDetailOpen = true;
  }

  closeDetail(): void {
    this.isDetailOpen = false;
    this.selectedUser = null;
  }

  editUser(user: User): void {
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
    if (!this.isCurrentUser(this.editForm)) return;
    const users = [...this.contentService.users];
    const idx = users.findIndex(u => u.id === this.editForm.id);
    if (idx > -1) {
      users[idx] = { ...users[idx], ...this.editForm };
      this.contentService.saveUsers(users);
      this.loadUsers();
      this.showToast('User Updated', `${this.editForm.fullName} has been updated.`);
    }
    this.closeEdit();
  }

  toggleStatus(user: User): void {
    if (this.isCurrentUser(user)) return;
    const users = [...this.contentService.users];
    const idx = users.findIndex(u => u.id === user.id);
    if (idx > -1) {
      users[idx].status = users[idx].status === 'Active' ? 'Suspended' : 'Active';
      this.contentService.saveUsers(users);
      this.loadUsers();
      this.showToast('Status Changed', `${user.fullName} is now ${users[idx].status}.`);
    }
  }

  deleteUser(user: User): void {
    if (this.isCurrentUser(user)) return;
    this.deleteUserConfirm = user;
  }

  confirmDelete(): void {
    if (!this.deleteUserConfirm) return;
    const users = this.contentService.users.filter(u => u.id !== this.deleteUserConfirm!.id);
    this.contentService.saveUsers(users);
    this.showToast('User Deleted', `${this.deleteUserConfirm.fullName} has been removed.`);
    this.deleteUserConfirm = null;
    this.loadUsers();
  }

  cancelDelete(): void {
    this.deleteUserConfirm = null;
  }

  regenerateOTP(user: User): void {
    const users = [...this.contentService.users];
    const idx = users.findIndex(u => u.id === user.id);
    if (idx > -1) {
      const newOTP = Math.floor(100000 + Math.random() * 900000).toString();
      users[idx].otp = newOTP;
      users[idx].password = newOTP;
      this.contentService.saveUsers(users);
      this.loadUsers();
      this.showToast('OTP Regenerated', `New code for ${user.fullName}: ${newOTP}`, 6000);
    }
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
      u.fullName, u.email, u.phone, u.role, u.organization, u.ticket, u.otp, u.status, u.registeredAt
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ntic-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }
}
