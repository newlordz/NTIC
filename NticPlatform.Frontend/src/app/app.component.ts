import { Component, OnInit, OnDestroy, HostListener, Renderer2 } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ThemeService } from './services/theme.service';
import { ContentService } from './services/content.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'ntic-frontend';
  isLandingPage = true;
  currentUser: { name: string; avatar: string; roleName: string; roleId: string } | null = null;
  showScrollToTop = false;
  isMobileSidebarOpen = false;
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
  };

  pageTitles: Record<string, string> = {
    'dashboard':    'Dashboard',
    'registration': 'Registration',
    'lms':          'Learning Management',
    'instructor':   'Instructor Portal',
    'judge':        'Judging Arena',
    'competitions': 'Competitions',
    'leaderboard':  'Leaderboard',
    'talent':       'Talent Discovery',
    'sponsors':     'Sponsors',
    'reporting':    'Reports & Analytics',
  };

  constructor(private router: Router, public themeService: ThemeService, public contentService: ContentService, private renderer: Renderer2) {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      const url = event.urlAfterRedirects || event.url;
      const parsedUrl = url.split('?')[0];
      this.loadUserProfile();

      this.isLandingPage =
        parsedUrl === '/' ||
        parsedUrl === '/landing' ||
        parsedUrl === '' ||
        parsedUrl === '/registration' ||
        parsedUrl === '/news';

      if (typeof window !== 'undefined') {
        document.body.style.overflow = '';
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        setTimeout(() => {
          window.scrollTo(0, 0);
          const mainContent = document.querySelector('.main-content');
          if (mainContent) {
            mainContent.scrollTop = 0;
          }
        }, 0);
      }
    });
  }

  ngOnInit(): void {
    this.loadUserProfile();
    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', this.scrollListener, true);
    }
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

  logout(): void {
    localStorage.removeItem('activeRoleId');
    localStorage.removeItem('activeUserEmail');
    this.currentUser = null;
    this.closeMobileSidebar();
    this.router.navigate(['/']);
  }

  getInitials(name: string): string {
    if (!name) return '??';
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }

  loadUserProfile(): void {
    const roleId = localStorage.getItem('activeRoleId') || 'super_admin';
    const activeEmail = localStorage.getItem('activeUserEmail') || '';
    
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
    } else {
      const profile = this.userProfiles[roleId] || this.userProfiles['super_admin'];
      this.currentUser = { roleId, ...profile };
    }
  }

  hasAccess(menuItem: string): boolean {
    if (!this.currentUser) return false;
    const role = this.currentUser.roleId;
    const adminRoles = ['super_admin', 'content_manager', 'reviewer', 'competition_manager'];

    switch (menuItem) {
      case 'dashboard':    return true;
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
      case 'records':      return ['instructor', 'school_admin', 'super_admin', 'reviewer'].includes(role);
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
    { id: 1, title: 'New School Admin registered: Prempeh College', time: 'Just now', icon: 'school', unread: true, category: 'Registration' },
    { id: 2, title: 'Analytics engine synced 1,248 student records', time: '5m ago', icon: 'sync', unread: true, category: 'System' },
    { id: 3, title: 'Submission graded: Coding Challenge #4', time: '1h ago', icon: 'task_alt', unread: true, category: 'Judging' },
    { id: 4, title: 'LMS backup snapshot created successfully', time: '2h ago', icon: 'cloud_done', unread: false, category: 'System' }
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
