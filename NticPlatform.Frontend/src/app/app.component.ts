import { getAuthValue, clearAllAuthValues, hasRememberedDevice, purgeLegacyStoredPassword, purgeLegacyAuthStorage } from './services/session.util';
import { resetVerifiedRoleCache } from './guards/auth.guard';
import { AppUpdateService } from './services/app-update.service';
import { Component, OnInit, OnDestroy, HostListener, Renderer2, inject } from '@angular/core';
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
import { IdleTimeoutService } from './services/idle-timeout.service';
import { ToastContainerComponent } from './components/toast-container/toast-container.component';
import { CommandPaletteComponent } from './components/command-palette/command-palette.component';

import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    TimeAgoPipe,
    ChatbotComponent,
    ToastContainerComponent,
    CommandPaletteComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly appUpdate = inject(AppUpdateService);
  private readonly idleTimeout = inject(IdleTimeoutService);
  title = 'ntic-frontend';
  isLandingPage = true;
  currentUser: { name: string; avatar: string; roleName: string; roleId: string } | null = null;
  showScrollToTop = false;
  isMobileSidebarOpen = false;
  private ticketPollTimer: any = null;
  private idleSubs: { unsubscribe(): void }[] = [];
  private idleWarningOpen = false;
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
      // credentials don't linger on shared/public machines.
      //
      // "Remember this device" does NOT persist the session -- it only stores
      // the username so the login form can prefill it (see
      // saveRememberedCredentials). The token itself is always sessionStorage
      // only. All the flag does here is opt out of this homepage sign-out.
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
    // Migration: earlier builds base64-encoded the user's real password into
    // localStorage for "remember this device". Remove it on first load so
    // existing users are cleaned up without having to do anything.
    purgeLegacyStoredPassword();
    // Migration: earlier builds also fell back to reading session values from
    // localStorage. Delete any token/role left there, otherwise it would
    // outlive both the tab-close sign-out and the inactivity timeout.
    purgeLegacyAuthStorage();
    // Watch for new deployments and offer a reload. Without this, an installed
    // PWA can stay on a stale bundle indefinitely.
    this.appUpdate.init();
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

    // ── Inactivity sign-out ──────────────────────────────────────────
    // Runs for the whole app lifetime and no-ops while signed out, so it
    // covers reloads and logging in from any route.
    this.idleSubs.push(
      this.idleTimeout.expired$.subscribe(() => this.onSessionIdleExpired()),
      this.idleTimeout.warning$.subscribe(seconds => this.onSessionIdleWarning(seconds)),
      this.idleTimeout.warningCleared$.subscribe(() => {
        if (this.idleWarningOpen) {
          this.idleWarningOpen = false;
          this.dialogService.closeConfirm(true);
        }
      })
    );
    this.idleTimeout.start();
  }

  /**
   * Shows the "still there?" prompt. If the user does not answer before the
   * deadline the dialog is dismissed for them and the session ends -- otherwise
   * an unattended prompt would hold the session open indefinitely, which is the
   * exact thing the timeout exists to prevent.
   */
  private async onSessionIdleWarning(secondsLeft: number): Promise<void> {
    if (this.idleWarningOpen) return;
    this.idleWarningOpen = true;

    const stay = await this.dialogService.confirm({
      title: 'Are you still there?',
      message:
        `You have been inactive for a while. For your security you will be signed out in about ` +
        `${Math.max(1, secondsLeft)} seconds.`,
      confirmText: 'Stay signed in',
      cancelText: 'Sign out now',
      type: 'warning'
    });

    // Already handled by the expiry path (dialog was force-closed).
    if (!this.idleWarningOpen) return;
    this.idleWarningOpen = false;

    if (stay) {
      this.idleTimeout.continueSession();
    } else {
      this.performLogout('You have been signed out.');
    }
  }

  private onSessionIdleExpired(): void {
    if (this.idleWarningOpen) {
      this.idleWarningOpen = false;
      // Dismiss the unanswered prompt before signing out.
      this.dialogService.closeConfirm(false);
    }
    if (!getAuthValue('activeUserToken')) return;
    this.performLogout(`You were signed out after ${this.idleTimeout.idleLimitMinutes} minutes of inactivity.`);
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
    this.idleSubs.forEach(s => s.unsubscribe());
    this.idleSubs = [];
    this.idleTimeout.stop();
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
    this.performLogout();
  }

  /**
   * Single sign-out path, shared by the menu action and the inactivity timeout,
   * so both always clear exactly the same state.
   */
  private performLogout(notice?: string): void {
    const token = getAuthValue('activeUserToken');
    if (token) {
      this.apiService.logout(token).subscribe({ next: () => {}, error: () => {} });
    }
    clearAllAuthValues();
    // Drop the guard's server-verified role. Without this, signing back in as a
    // different user in the same tab reused the previous user's role.
    resetVerifiedRoleCache();
    this.idleTimeout.clearStoredActivity();
    this.currentUser = null;
    this.showPasswordSetupModal = false;
    this.isForcedPasswordChange = false;
    this.chatbot.resetSession();
    this.closeMobileSidebar();
    this.router.navigate(['/']);
    if (notice) {
      this.dialogService.toast(notice, 'info', 6000);
    }
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

  // ── Password Setup / Change Flow ──
  showPasswordSetupModal = false;
  currentPasswordInput = '';
  newPasswordInput = '';
  confirmPasswordInput = '';
  isNewPasswordVisible = false;
  /** True for a forced rotation, where the current password may be skipped. */
  isForcedPasswordChange = false;
  passwordMinLength = 10;
  passwordSetupError = '';
  isSavingPassword = false;
  passwordSetupToast = '';

  checkFirstTimePasswordRequirement(user: any): void {
    if (!user) return;
    // Ask the SERVER whether a change is required. The old version guessed from
    // cached fields (including `user.password === user.otp`, which meant the
    // plaintext password had to be sitting in local storage to work at all).
    this.apiService.getMyProfile().subscribe({
      next: (me) => {
        this.passwordMinLength = me?.password_min_length || 10;
        if (me?.must_change_password) {
          this.isForcedPasswordChange = true;
          this.showPasswordSetupModal = true;
        }
      },
      error: () => { /* not signed in, or offline - nothing to prompt for */ }
    });
  }

  /** Opens the modal for a voluntary change (current password required). */
  openChangePasswordModal(): void {
    this.isForcedPasswordChange = false;
    this.passwordSetupError = '';
    this.currentPasswordInput = '';
    this.newPasswordInput = '';
    this.confirmPasswordInput = '';
    this.showPasswordSetupModal = true;
  }

  closePasswordSetupModal(): void {
    // A forced change may not be dismissed.
    if (this.isForcedPasswordChange) return;
    this.showPasswordSetupModal = false;
    this.currentPasswordInput = '';
    this.newPasswordInput = '';
    this.confirmPasswordInput = '';
    this.passwordSetupError = '';
  }

  submitNewPassword(): void {
    const newPass = this.newPasswordInput.trim();

    if (newPass.length < this.passwordMinLength) {
      this.passwordSetupError = `Password must be at least ${this.passwordMinLength} characters long.`;
      return;
    }
    if (newPass !== this.confirmPasswordInput.trim()) {
      this.passwordSetupError = 'Passwords do not match. Please check and try again.';
      return;
    }
    if (!this.isForcedPasswordChange && !this.currentPasswordInput) {
      this.passwordSetupError = 'Please enter your current password.';
      return;
    }

    this.isSavingPassword = true;
    this.passwordSetupError = '';

    // The server verifies, applies the policy, stores the hash and signs out
    // other devices. Nothing about the password is kept client-side.
    this.apiService.changeMyPassword(this.currentPasswordInput, newPass).subscribe({
      next: (res) => {
        this.isSavingPassword = false;
        this.isForcedPasswordChange = false;
        this.showPasswordSetupModal = false;
        this.currentPasswordInput = '';
        this.newPasswordInput = '';
        this.confirmPasswordInput = '';
        const revoked = res?.other_sessions_revoked || 0;
        this.passwordSetupToast = revoked
          ? `Password updated. ${revoked} other device(s) were signed out.`
          : 'Password updated successfully.';
        setTimeout(() => (this.passwordSetupToast = ''), 6000);
      },
      error: (err) => {
        this.isSavingPassword = false;
        this.passwordSetupError =
          err?.error?.detail || 'Could not update your password. Please try again.';
      }
    });
  }

  hasAccess(menuItem: string): boolean {
    if (!this.currentUser) return false;
    const role = this.currentUser.roleId;
    const adminRoles = ['super_admin', 'admin', 'content_manager', 'reviewer', 'competition_manager'];

    // These must agree with ROLE_ACCESS in guards/auth.guard.ts, otherwise the
    // user sees a menu item and is then bounced by the guard. Previously
    // `reporting` was shown to instructors the guard rejected, `lms` was hidden
    // from instructors the guard allowed, and `users` was shown to
    // support_admin/competition_manager whose API calls all return 403.
    switch (menuItem) {
      case 'dashboard':    return true;
      case 'overview':     return adminRoles.includes(role);
      case 'admin_control': return adminRoles.includes(role);
      case 'roster':       return ['school_admin'].includes(role);
      case 'registration': return ['instructor', 'super_admin', 'admin'].includes(role);
      case 'lms':          return ['student'].includes(role);
      case 'competitions': return ['student', 'instructor', 'school_admin', 'judge', 'super_admin', 'admin', 'content_manager', 'competition_manager'].includes(role);
      case 'leaderboard':  return ['student', 'instructor', 'school_admin', 'judge', 'sponsor', ...adminRoles].includes(role);
      case 'talent':       return ['instructor', 'sponsor'].includes(role);
      case 'sponsors':     return ['sponsor', 'super_admin', 'admin'].includes(role);
      // Judging workspace. Mirrors the backend's GRADING_ROLES and the
      // 'judge' entry in the auth guard's ROLE_ACCESS map.
      case 'judging':      return ['judge', 'reviewer', 'instructor', 'super_admin', 'admin'].includes(role);
      case 'reporting':    return ['super_admin', 'admin', 'reviewer', 'instructor', 'school_admin'].includes(role);
      case 'records':      return ['super_admin', 'admin', 'content_manager'].includes(role);
      case 'users':        return ['super_admin', 'admin'].includes(role);
      case 'lms_admin':    return ['super_admin', 'admin', 'content_manager', 'instructor'].includes(role);
      case 'support':      return ['super_admin', 'admin', 'support_admin'].includes(role);
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
