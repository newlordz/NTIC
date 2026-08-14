import { getAuthValue, clearAllAuthValues, hasRememberedDevice } from './services/session.util';
import { Component, OnInit, OnDestroy, HostListener, Renderer2 } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ThemeService } from './services/theme.service';
import { ContentService } from './services/content.service';
import { TimeAgoPipe } from './services/time-ago.pipe';
import { DialogService } from './services/dialog.service';
import { ChatbotComponent } from './chatbot/chatbot.component';
import { ChatbotService } from './services/chatbot.service';
import { ApiService } from './services/api.service';

import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterOutlet, RouterLink, RouterLinkActive, TimeAgoPipe, ChatbotComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'ntic-frontend';
  isLandingPage = true;
  currentUser: { name: string; avatar: string; roleName: string; roleId: string } | null = null;
  showScrollToTop = false;
  isMobileSidebarOpen = false;
  private ticketPollTimer: any = null;
  private scrollRafPending = false;
  private scrollListener = () => {
    if (this.scrollRafPending) return;
    this.scrollRafPending = true;
    requestAnimationFrame(() => {
      this.scrollRafPending = false;
      this.checkScroll();
    });
  };

  userProfiles: Record<string, { name: string; avatar: string; roleName: string }> = {
    student:        { name: 'Kwame Asante',       avatar: 'KA', roleName: 'Student' },
    instructor:     { name: 'Efua Mensah',         avatar: 'EM', roleName: 'Instructor' },
    school_admin:   { name: 'Dr. Emmanuel Osei',   avatar: 'EO', roleName: 'School Admin' },
    judge:          { name: 'Prof. Yaw Osei',       avatar: 'YO', roleName: 'Competition Judge' },
    sponsor:        { name: 'Sampson Cudjoe',       avatar: 'SC', roleName: 'Sponsor Partner' },
    super_admin:    { name: 'Admin',                 avatar: 'AD', roleName: 'Super Admin' },
    content_manager:{ name: 'Content Manager',      avatar: 'CM', roleName: 'Content Manager' },
    reviewer:       { name: 'Reviewer',             avatar: 'RV', roleName: 'Reviewer' },
    competition_manager:{ name: 'Competition Manager', avatar: 'CP', roleName: 'Competition Manager' },
    support_admin:  { name: 'Support Agent',        avatar: 'SA', roleName: 'Support Admin' },
  };

  pageTitles: Record<string, string> = {
    'dashboard':    'Dashboard',
    'registration': 'Registration',
    'lms':          'Learning Management',
    'instructor':   'Instructor Portal',
    'judge':        'Judging Arena',
    'competitions': 'Competitions',
    'admin':        'Competition Cycle Manager',
    'leaderboard':  'Leaderboard',
    'talent':       'Talent Discovery',
    'sponsors':     'Sponsors',
    'reporting':    'Reports & Analytics',
  };

  private lastNavigatedPath = '';

  constructor(private router: Router, public themeService: ThemeService, public contentService: ContentService, public dialogService: DialogService, private renderer: Renderer2, private chatbot: ChatbotService, private apiService: ApiService) {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      const url = event.urlAfterRedirects || event.url;
      const parsedUrl = url.split('?')[0].split('#')[0];
      const hasFragment = (event.url && event.url.includes('#')) || (event.urlAfterRedirects && event.urlAfterRedirects.includes('#'));
      const isDifferentRoute = this.lastNavigatedPath !== '' && this.lastNavigatedPath !== parsedUrl;
      this.lastNavigatedPath = parsedUrl;

      this.loadUserProfile();

      this.isLandingPage =
        parsedUrl === '/' ||
        parsedUrl === '/landing' ||
        parsedUrl === '' ||
        parsedUrl === '/registration' ||
        parsedUrl === '/news' ||
        parsedUrl === '/leaderboard' ||
        parsedUrl === '/competitions' ||
        parsedUrl === '/talent';

      // Admins on /leaderboard get the admin shell (sidebar + header), not the public nav
      if (parsedUrl === '/leaderboard') {
        const role = getAuthValue('activeRoleId');
        if (role === 'super_admin' || role === 'admin') {
          this.isLandingPage = false;
        }
      }

      // Visiting the public homepage ends a NON-remembered session, so
      // credentials don't linger on shared/public machines. Sessions where
      // "Remember this device" was ticked are kept (persisted in localStorage).
      if ((parsedUrl === '/' || parsedUrl === '/landing' || parsedUrl === '') && getAuthValue('activeRoleId') && !hasRememberedDevice()) {
        clearAllAuthValues();
        this.currentUser = null;
        this.chatbot.resetSession();
      }

      // ONLY scroll to top when genuinely transitioning to a DIFFERENT page,
      // NOT during in-page events, same-page scroll, or section anchor navigation.
      if (isDifferentRoute && !hasFragment && typeof window !== 'undefined') {
        document.body.style.overflow = '';
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
          mainContent.scrollTop = 0;
        }
      }
    });
  }

  ngOnInit(): void {
    this.loadUserProfile();
    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', this.scrollListener, true);
      window.addEventListener('beforeinstallprompt', (e: Event) => {
        e.preventDefault();
      });
    }
    // Load support tickets for admin badge
    if (this.currentUser?.roleId === 'super_admin' || this.currentUser?.roleId === 'support_admin') {
      this.chatbot.loadAllTickets();
      this.ticketPollTimer = setInterval(() => this.chatbot.loadAllTickets(), 15000);
    }
  }

  get openTicketCount(): number {
    return this.chatbot.supportTickets().filter(t => t.status === 'open' || t.status === 'in_progress').length;
  }

  toggleMobileSidebar(): void {
    this.isMobileSidebarOpen = !this.isMobileSidebarOpen;
    if (this.isMobileSidebarOpen) {
      this.renderer.addClass(document.body, 'sidebar-drawer-open');
    } else {
      this.renderer.removeClass(document.body, 'sidebar-drawer-open');
    }
  }

  closeMobileSidebar(): void {
    this.isMobileSidebarOpen = false;
    this.renderer.removeClass(document.body, 'sidebar-drawer-open');
  }

  navigateToDashboard(): void {
    this.closeMobileSidebar();
    this.router.navigate(['/dashboard'], { queryParams: {} });
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (typeof window !== 'undefined' && window.innerWidth > 768) {
      this.closeMobileSidebar();
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', this.scrollListener, true);
    }
    if (this.ticketPollTimer) clearInterval(this.ticketPollTimer);
    this.closeMobileSidebar();
  }

  checkScroll(): void {
    const winScroll = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    let containerScroll = 0;
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      containerScroll = mainContent.scrollTop || 0;
    }
    const anyScroll = winScroll > 300 || containerScroll > 300 || (document.scrollingElement && document.scrollingElement.scrollTop > 300);
    if (this.showScrollToTop !== Boolean(anyScroll)) {
      this.showScrollToTop = Boolean(anyScroll);
    }
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  navigateSidebarCTA(): void {
    const roleId = this.currentUser?.roleId;
    if (roleId === 'judge') {
      window.location.hash = '#/judge';
    } else if (roleId === 'instructor') {
      window.location.hash = '#/instructor';
    } else if (roleId === 'school_admin') {
      window.location.hash = '#/dashboard?action=add_team';
    } else {
      window.location.hash = '#/admin/competitions';
    }
  }

  logout(): void {
    const token = getAuthValue('activeUserToken');
    if (token) {
      this.apiService.logout(token).subscribe({ next: () => {}, error: () => {} });
    }
    clearAllAuthValues();
    this.currentUser = null;
    this.chatbot.resetSession();
    this.closeMobileSidebar();
    this.router.navigate(['/']);
  }

  getInitials(name: string): string {
    if (!name) return '??';
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }

  loadUserProfile(): void {
    const roleId = getAuthValue('activeRoleId');
    const activeEmail = getAuthValue('activeUserEmail') || '';
    
    if (!roleId || !activeEmail) {
      this.currentUser = null;
      return;
    }
    
    // Look up real registered user in ContentService
    const registeredUser = this.contentService.users.find(u => 
      u.email?.trim().toLowerCase() === activeEmail.trim().toLowerCase() ||
      u.ticket?.trim().toUpperCase() === activeEmail.trim().toUpperCase()
    );

    if (registeredUser) {
      const roleLabels: Record<string, string> = {
        judge: 'Competition Judge', sponsor: 'Sponsor Partner', instructor: 'Instructor',
        content_manager: 'Content Manager', reviewer: 'Reviewer', competition_manager: 'Competition Manager',
        school_admin: 'School Admin', student: 'Student', super_admin: 'Super Admin'
      };
      this.currentUser = {
        roleId,
        name: registeredUser.fullName,
        avatar: this.getInitials(registeredUser.fullName),
        roleName: roleLabels[registeredUser.role] || 'User'
      };
      this.checkFirstTimePasswordRequirement(registeredUser);
    } else {
      const storedName = getAuthValue('activeUserName');
      const profile = this.userProfiles[roleId] || this.userProfiles['super_admin'];
      const displayName = storedName || profile.name;
      this.currentUser = { 
        roleId, 
        name: displayName,
        avatar: this.getInitials(displayName),
        roleName: profile.roleName
      };
    }
  }

  // ── First-Time Login Password Setup Flow ──
  showPasswordSetupModal = false;
  newPasswordInput = '';
  confirmPasswordInput = '';
  isNewPasswordVisible = false;
  passwordSetupError = '';
  isSavingPassword = false;
  passwordSetupToast = '';

  checkFirstTimePasswordRequirement(user: any): void {
    if (!user) return;
    const needsPassword = user.mustSetPassword || user.isFirstLogin || user.passwordChanged === false || (user.otp && user.password === user.otp);
    if (needsPassword) {
      this.showPasswordSetupModal = true;
    }
  }

  submitNewPassword(): void {
    if (!this.newPasswordInput || this.newPasswordInput.length < 6) {
      this.passwordSetupError = 'Password must be at least 6 characters long.';
      return;
    }
    if (this.newPasswordInput !== this.confirmPasswordInput) {
      this.passwordSetupError = 'Passwords do not match. Please check and try again.';
      return;
    }

    this.isSavingPassword = true;
    this.passwordSetupError = '';

    const userEmail = getAuthValue('activeUserEmail') || '';
    const userTicket = getAuthValue('activeUserTicket') || '';
    const targetUser = this.contentService.users.find(u => 
      (userEmail && u.email?.trim().toLowerCase() === userEmail.trim().toLowerCase()) ||
      (userTicket && u.ticket?.trim().toLowerCase() === userTicket.trim().toLowerCase())
    );

    const newPass = this.newPasswordInput.trim();

    if (targetUser) {
      const updatedUsers = this.contentService.users.map(u => {
        if (u.id === targetUser.id) {
          return {
            ...u,
            password: newPass,
            otp: '', // void temporary OTP
            mustSetPassword: false,
            passwordChanged: true
          };
        }
        return u;
      });
      this.contentService.saveUsers(updatedUsers);

      this.apiService.updateUser(targetUser.id, {
        email: targetUser.email,
        full_name: targetUser.fullName,
        role: targetUser.role,
        status: targetUser.status || 'Active',
        ticket: targetUser.ticket,
        password: newPass
      }).subscribe({
        next: () => console.log('Password updated in backend DB'),
        error: (err) => console.warn('Backend password sync notice:', err)
      });

      this.contentService.saveAuditLogs([
        { action: `First-time password setup completed: ${userEmail}`, user: userEmail, time: new Date().toISOString(), type: 'security' },
        ...this.contentService.auditLogs
      ]);
    }

    setTimeout(() => {
      this.isSavingPassword = false;
      this.showPasswordSetupModal = false;
      this.newPasswordInput = '';
      this.confirmPasswordInput = '';
      this.passwordSetupToast = '✅ Permanent password saved! Your temporary OTP access pass has been voided.';
      setTimeout(() => (this.passwordSetupToast = ''), 5000);
    }, 800);
  }

  hasAccess(menuItem: string): boolean {
    if (!this.currentUser) return false;
    const role = this.currentUser.roleId;
    const adminRoles = ['super_admin', 'content_manager', 'reviewer', 'competition_manager'];

    switch (menuItem) {
      case 'dashboard':    return true;
      case 'overview':     return adminRoles.includes(role);
      case 'admin_control': return adminRoles.includes(role);
      case 'roster':       return ['school_admin'].includes(role);
      case 'registration': return ['instructor', 'super_admin'].includes(role);
      case 'lms':          return ['student'].includes(role);
      case 'instructor':   return ['instructor'].includes(role);
      case 'judge':        return ['judge'].includes(role);
      case 'competitions': return ['student', 'instructor', 'school_admin', 'judge', 'super_admin', 'content_manager', 'competition_manager'].includes(role);
      case 'leaderboard':  return ['student', 'instructor', 'school_admin', 'judge', 'sponsor', ...adminRoles].includes(role);
      case 'talent':       return ['instructor', 'sponsor'].includes(role);
      case 'sponsors':     return ['sponsor'].includes(role);
      case 'reporting':    return ['instructor', 'school_admin', 'super_admin', 'reviewer'].includes(role);
      case 'records':      return true;
      case 'users':        return ['super_admin', 'admin', 'support_admin', 'competition_manager'].includes(role);
      case 'lms_admin':    return ['super_admin', 'content_manager'].includes(role);
      case 'support':      return ['super_admin', 'support_admin'].includes(role);
      default:             return false;
    }
  }

  get currentTitle(): string {
    const hash = window.location.hash;
    const seg = hash.replace('#/', '').split('?')[0].split('/')[0] || 'dashboard';
    return this.pageTitles[seg] ?? 'NTIC Portal';
  }

  showNotificationsDropdown = false;
  showAppsDropdown = false;
  showProfileDropdown = false;

  notificationsList = [
    { id: 1, title: 'New School Admin registered: Prempeh College', time: new Date().toISOString(), icon: 'school', unread: true, category: 'Registration' },
    { id: 2, title: 'Analytics engine synced 1,248 student records', time: new Date(Date.now() - 300000).toISOString(), icon: 'sync', unread: true, category: 'System' },
    { id: 3, title: 'Submission graded: Coding Challenge #4', time: new Date(Date.now() - 3600000).toISOString(), icon: 'task_alt', unread: true, category: 'Judging' },
    { id: 4, title: 'LMS backup snapshot created successfully', time: new Date(Date.now() - 7200000).toISOString(), icon: 'cloud_done', unread: false, category: 'System' }
  ];

  get liveNotifications(): any[] {
    const list = [...this.notificationsList];
    if (this.contentService && this.contentService.pendingApprovals && this.contentService.pendingApprovals.length > 0) {
      list.unshift({
        id: 999,
        title: `${this.contentService.pendingApprovals.length} pending registration approvals awaiting action`,
        time: 'Live Action Required',
        icon: 'verified_user',
        unread: true,
        category: 'Pending Review'
      });
    }
    return list;
  }

  get activeUnreadCount(): number {
    return this.liveNotifications.filter(n => n.unread).length;
  }

  toggleNotifications(event: MouseEvent): void {
    event.stopPropagation();
    this.showNotificationsDropdown = !this.showNotificationsDropdown;
    this.showAppsDropdown = false;
    this.showProfileDropdown = false;
  }

  toggleApps(event: MouseEvent): void {
    event.stopPropagation();
    this.showAppsDropdown = !this.showAppsDropdown;
    this.showNotificationsDropdown = false;
    this.showProfileDropdown = false;
  }

  toggleProfile(event: MouseEvent): void {
    event.stopPropagation();
    this.showProfileDropdown = !this.showProfileDropdown;
    this.showNotificationsDropdown = false;
    this.showAppsDropdown = false;
  }

  markAllNotificationsRead(event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.notificationsList.forEach(n => n.unread = false);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.showNotificationsDropdown = false;
    this.showAppsDropdown = false;
    this.showProfileDropdown = false;
  }
}
