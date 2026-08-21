import { getAuthValue, clearAllAuthValues, hasRememberedDevice, purgeLegacyStoredPassword, purgeLegacyAuthStorage, purgeCardDataFromDrafts } from './services/session.util';
import { resetVerifiedRoleCache } from './guards/auth.guard';
import { AppUpdateService } from './services/app-update.service';
import { Component, OnInit, OnDestroy, HostListener, Renderer2, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { filter, take, throttleTime } from 'rxjs/operators';
import { ThemeService } from './services/theme.service';
import { ContentService } from './services/content.service';
import { TimeAgoPipe } from './services/time-ago.pipe';
import { DialogService } from './services/dialog.service';
import { ChatbotComponent } from './chatbot/chatbot.component';
import { ChatbotService } from './services/chatbot.service';
import { ApiService, MyProfile } from './services/api.service';
import { CurrentUserService } from './services/current-user.service';
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
  isRouteLoading = false;
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

  // One entry per real route in app.routes.ts. While currentTitle was reading the
  // (always-empty) URL hash, every page rendered as "Dashboard" and the gaps here
  // were invisible; now that the lookup works, a missing key would show the generic
  // "NTIC Portal" instead of the page name.
  pageTitles: Record<string, string> = {
    'dashboard':    'Dashboard',
    'registration': 'Registration',
    'lms':          'Learning Management',
    'lms-manager':  'LMS Manager',
    'competitions': 'Competitions',
    'admin':        'Competition Cycle Manager',
    'leaderboard':  'Leaderboard',
    'talent':       'Talent Discovery',
    'sponsors':     'Sponsors',
    'reporting':    'Reports & Analytics',
    'judge':        'Observatory',
    'records':      'Records',
    'user-management': 'User Management',
    'profile-completion': 'Profile & Account Settings',
    'news':         'News',
  };

  private lastNavigatedPath = '';

  constructor(private router: Router, public themeService: ThemeService, public contentService: ContentService, public dialogService: DialogService, private renderer: Renderer2, private chatbot: ChatbotService, private apiService: ApiService, public currentUserService: CurrentUserService) {
    this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        this.isRouteLoading = true;
      } else if (event instanceof NavigationEnd || event instanceof NavigationCancel || event instanceof NavigationError) {
        setTimeout(() => {
          this.isRouteLoading = false;
        }, 220);
      }
    });

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
      //
      // This used to happen SILENTLY, which made it a trap: /competitions and
      // /leaderboard render the public nav for non-admin roles, and its only route
      // back was "Home" -> "/". A student or judge clicking Home mid-task was
      // signed out with no explanation. The nav now offers "Back to my dashboard"
      // instead, and if this path is still taken the user is told why.
      if ((parsedUrl === '/' || parsedUrl === '/landing' || parsedUrl === '') && getAuthValue('activeRoleId') && !hasRememberedDevice()) {
        clearAllAuthValues();
        resetVerifiedRoleCache();
        this.currentUserService.clear();
        this.currentUser = null;
        this.chatbot.resetSession();
        this.dialogService.toast(
          'You were signed out because you returned to the public homepage. Tick "Remember this device" at sign-in to stay signed in here.',
          'info',
          8000,
        );
      }

      // If transitioning to a DIFFERENT page, clear that page's saved scroll and reset to top.
      if (isDifferentRoute && !hasFragment && typeof window !== 'undefined') {
        try { sessionStorage.removeItem(`ntic_scroll_pos_${parsedUrl}`); } catch (_) {}
        document.body.style.overflow = '';
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
          mainContent.scrollTop = 0;
        }
      } else if (!isDifferentRoute && typeof window !== 'undefined') {
        // Same route / Page Refresh: restore exact scroll position across render frames
        this.restoreScrollPosition(parsedUrl);
      }
    });
  }

  private isRestoringScroll = false;
  private scrollSaveTimer: any = null;

  private onWindowScroll(): void {
    if (this.isRestoringScroll || typeof window === 'undefined') return;
    if (this.scrollSaveTimer) clearTimeout(this.scrollSaveTimer);
    this.scrollSaveTimer = setTimeout(() => {
      try {
        const path = (window.location.pathname || '/').split('?')[0].split('#')[0];
        const y = window.scrollY || document.documentElement.scrollTop || 0;
        if (y > 0) {
          sessionStorage.setItem(`ntic_scroll_pos_${path}`, y.toString());
        }
      } catch (_) {}
    }, 80);
  }

  private restoreScrollPosition(path: string): void {
    if (typeof window === 'undefined') return;
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(`ntic_scroll_pos_${path}`);
    } catch (_) {}
    if (!saved) return;
    const targetY = parseInt(saved, 10);
    if (isNaN(targetY) || targetY <= 0) return;

    this.isRestoringScroll = true;
    let attempts = 0;
    const maxAttempts = 16;

    const performRestore = () => {
      if (!this.isRestoringScroll) return;
      attempts++;
      window.scrollTo({ top: targetY, behavior: 'instant' as ScrollBehavior });
      document.documentElement.scrollTop = targetY;
      document.body.scrollTop = targetY;

      const currentY = window.scrollY || document.documentElement.scrollTop || 0;
      if (Math.abs(currentY - targetY) < 10 || attempts >= maxAttempts) {
        if (attempts >= 4) {
          this.isRestoringScroll = false;
          return;
        }
      }

      if (attempts < maxAttempts) {
        setTimeout(performRestore, 60);
      } else {
        this.isRestoringScroll = false;
      }
    };

    const userCancel = () => {
      this.isRestoringScroll = false;
      window.removeEventListener('wheel', userCancel);
      window.removeEventListener('touchstart', userCancel);
      window.removeEventListener('keydown', userCancel);
    };
    window.addEventListener('wheel', userCancel, { passive: true, once: true });
    window.addEventListener('touchstart', userCancel, { passive: true, once: true });
    window.addEventListener('keydown', userCancel, { passive: true, once: true });

    // Multi-phase restoration as DOM paints
    requestAnimationFrame(performRestore);
    setTimeout(performRestore, 80);
    setTimeout(performRestore, 220);
    setTimeout(performRestore, 500);
    setTimeout(performRestore, 900);
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
    // Migration: the profile-completion form used to save card number and CVV
    // into localStorage['ntic_drafts']. Existing users still have that on disk,
    // so scrub it on first load after this update.
    purgeCardDataFromDrafts();
    // Watch for new deployments and offer a reload. Without this, an installed
    // PWA can stay on a stale bundle indefinitely.
    this.appUpdate.init();
    this.loadUserProfile();
    // Tell the user when a save did not reach the server. These writes go through
    // POST /api/bulk-sync, which is admin-only, so an instructor's course or a
    // sponsor's payment would 403 and survive only in this browser -- previously
    // with no indication at all. Deduped per collection so one failed batch does
    // not produce a stack of identical toasts.
    this.contentService.writeFailures$
      .pipe(throttleTime(8000))
      .subscribe(failure => this.dialogService.toast(failure.message, 'error', 9000));
    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', () => this.onWindowScroll(), { passive: true });
      window.addEventListener('beforeunload', () => {
        try {
          const path = (window.location.pathname || '/').split('?')[0].split('#')[0];
          const y = window.scrollY || document.documentElement.scrollTop || 0;
          if (y > 0) {
            sessionStorage.setItem(`ntic_scroll_pos_${path}`, y.toString());
          }
        } catch (_) {}
      });
      window.addEventListener('beforeinstallprompt', (e: Event) => {
        e.preventDefault();
      });

      // ── Universal Dissolution of Splash Screen ──
      const dismissSplash = () => {
        (window as any).__nticAppReady = true;
        if (typeof (window as any)?.__dismissNticSplash === 'function') {
          (window as any).__dismissNticSplash();
        }
        const candidates = [
          document.getElementById('ntic-splash'),
          document.getElementById('ntic-preboot-splash'),
          ...Array.from(document.querySelectorAll('.ntic-splash-container'))
        ].filter(Boolean) as HTMLElement[];

        candidates.forEach(el => {
          el.classList.add('out', 'ntic-splash-fadeout');
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          setTimeout(() => {
            try { el.remove(); } catch (_) {}
          }, 750);
        });
      };

      // Dismiss as soon as the first route has actually painted, rather than
      // after a fixed delay. A fixed setTimeout cannot run until the main
      // thread finishes its synchronous startup storage work, so on spinning
      // disks the old 600ms timer landed seconds late and the splash outlived
      // the app becoming usable. Two nested frames guarantee the router outlet
      // has been painted, so there is no white flash either.
      const dismissWhenPainted = () => {
        requestAnimationFrame(() => requestAnimationFrame(dismissSplash));
      };

      if (this.router.navigated) {
        dismissWhenPainted();
      } else {
        this.idleSubs.push(
          this.router.events
            .pipe(filter(e => e instanceof NavigationEnd), take(1))
            .subscribe(() => dismissWhenPainted())
        );
      }
    }
    // Load support tickets for admin badge only when properly authenticated
    if ((this.currentUser?.roleId === 'super_admin' || this.currentUser?.roleId === 'support_admin') && getAuthValue('activeUserToken')) {
      this.chatbot.loadAllTickets();
      this.ticketPollTimer = setInterval(() => {
        if (getAuthValue('activeUserToken')) {
          this.chatbot.loadAllTickets();
        }
      }, 15000);
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

  /**
   * The sidebar's primary call-to-action ("Score Challenge" / "Grade Work" / ...).
   *
   * Every branch used to set `window.location.hash`. The app uses PATH routing --
   * there is no `withHashLocation()` anywhere in the project -- so assigning a
   * fragment only changed the URL bar and navigated nowhere. The button was inert
   * for every role.
   *
   * Two of the old targets were wrong even as fragments: `#/instructor` redirects
   * straight back to `/dashboard`, and `#/dashboard?action=add_team` relied on a
   * query parameter nothing reads.
   */
  navigateSidebarCTA(): void {
    const roleId = this.currentUser?.roleId;
    switch (roleId) {
      case 'judge':
        this.router.navigate(['/judge']);
        break;
      case 'instructor':
        // '/instructor' is only a redirect to the dashboard; the instructor's real
        // workspace is the LMS manager.
        this.router.navigate(['/lms-manager']);
        break;
      case 'school_admin':
        this.router.navigate(['/dashboard'], { queryParams: { tab: 'roster' } });
        break;
      case 'student':
        this.router.navigate(['/lms']);
        break;
      case 'sponsor':
        this.router.navigate(['/sponsors']);
        break;
      default:
        this.router.navigate(['/admin/competitions']);
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
    // Drop the cached identity too, otherwise the next user to sign in on this
    // tab briefly renders under the previous user's name.
    this.currentUserService.clear();
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

  private readonly roleLabels: Record<string, string> = {
    judge: 'Competition Judge', sponsor: 'Sponsor Partner', instructor: 'Instructor',
    content_manager: 'Content Manager', reviewer: 'Reviewer', competition_manager: 'Competition Manager',
    school_admin: 'School Admin', student: 'Student', super_admin: 'Super Admin',
    admin: 'Administrator', support_admin: 'Support Admin',
  };

  loadUserProfile(): void {
    const roleId = getAuthValue('activeRoleId');
    const activeEmail = getAuthValue('activeUserEmail') || '';

    if (!roleId || !activeEmail) {
      this.currentUser = null;
      return;
    }

    // Ask the server who this is. This used to search `contentService.users`,
    // which is populated from the admin-only GET /api/users -- so for a student,
    // judge, sponsor or instructor the lookup always failed and the code below
    // fell back to `userProfiles[roleId]`, a hardcoded fixture. That is why a real
    // judge saw "Prof. Yaw Osei" and a real student saw "Kwame Asante".
    this.currentUserService.ensureLoaded().subscribe(profile => {
      if (profile) {
        this.currentUser = {
          roleId: profile.role || roleId,
          name: profile.full_name,
          avatar: this.getInitials(profile.full_name),
          roleName: this.roleLabels[profile.role] || 'User',
        };
        // The server is authoritative about whether a password rotation is due.
        this.applyPasswordRequirement(profile);
        return;
      }

      // Offline or the request failed. Use the name captured at login rather than
      // a fixture, and only fall back to a generic label -- never to someone
      // else's name.
      const storedName = getAuthValue('activeUserName') || '';
      this.currentUser = {
        roleId,
        name: storedName,
        avatar: this.getInitials(storedName),
        roleName: this.roleLabels[roleId] || 'User',
      };
    });
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

  /**
   * Applies the server's password-rotation requirement.
   *
   * Takes the already-fetched profile instead of issuing its own request. The
   * previous version was only reachable from inside the `if (registeredUser)`
   * branch of loadUserProfile(), and `registeredUser` was never found for a
   * non-admin -- so a student or judge issued a temporary password was NEVER
   * prompted to change it, and that password stayed valid indefinitely.
   */
  applyPasswordRequirement(me: MyProfile | null): void {
    if (!me) return;
    this.passwordMinLength = me.password_min_length || 10;
    if (me.must_change_password) {
      this.isForcedPasswordChange = true;
      this.showPasswordSetupModal = true;
    }
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
      // `/lms` has a full instructor UI ("My Courses", "Submit for Review") and the
      // route guard already allows instructors -- but this returned student-only, so
      // no link was ever rendered and an instructor could only reach it by typing
      // the URL. Kept in step with ROLE_ACCESS['lms'] in auth.guard.ts.
      case 'lms':          return ['student', 'instructor'].includes(role);
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

  /**
   * The header title for the current page.
   *
   * This read `window.location.hash`, but the app uses PATH routing, so the hash is
   * always empty and `seg` always fell back to 'dashboard' -- every page in the app
   * was titled "Dashboard". Reads the router URL instead.
   */
  get currentTitle(): string {
    const path = (this.router.url || '/').split('?')[0].split('#')[0];
    const seg = path.split('/').filter(Boolean)[0] || 'dashboard';
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
