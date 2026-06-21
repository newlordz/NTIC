import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  isLandingPage = true;
  currentUser: { name: string; avatar: string; roleName: string; roleId: string } | null = null;

  userProfiles: Record<string, { name: string; avatar: string; roleName: string }> = {
    student: { name: 'Kwame Asante', avatar: 'KA', roleName: 'Student' },
    instructor: { name: 'Efua Mensah', avatar: 'EM', roleName: 'Instructor' },
    school_admin: { name: 'Dr. Emmanuel Osei', avatar: 'EO', roleName: 'School Admin' },
    judge: { name: 'Prof. Yaw Osei', avatar: 'YO', roleName: 'Competition Judge' },
    sponsor: { name: 'Sampson Cudjoe', avatar: 'SC', roleName: 'Sponsor Partner' },
    super_admin: { name: 'Amara Diallo', avatar: 'AD', roleName: 'Super Admin' }
  };

  pageTitles: Record<string, string> = {
    'dashboard':    'Dashboard',
    'registration': 'Registration',
    'lms':          'Learning Management',
    'competitions': 'Competitions',
    'leaderboard':  'Leaderboard',
    'talent':       'Talent Discovery',
    'sponsors':     'Sponsors',
    'reporting':    'Reports & Analytics',
  };

  constructor(private router: Router) {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      // With hash location, the route is represented relative to the hash.
      // E.g., Router url will be '/' for the empty path or '/dashboard' for dashboard path.
      const url = event.urlAfterRedirects || event.url;
      const parsedUrl = url.split('?')[0];
      this.loadUserProfile();
      
      const activeRoleId = localStorage.getItem('activeRoleId');
      const isAuthorizedRole = activeRoleId && ['super_admin', 'school_admin', 'instructor'].includes(activeRoleId);
      const isPublicRegistration = parsedUrl === '/registration' && !isAuthorizedRole;

      this.isLandingPage = parsedUrl === '/' || parsedUrl === '/landing' || parsedUrl === '' || !!isPublicRegistration;
    });
  }

  loadUserProfile(): void {
    const roleId = localStorage.getItem('activeRoleId') || 'super_admin';
    const profile = this.userProfiles[roleId] || this.userProfiles['super_admin'];
    this.currentUser = {
      roleId,
      ...profile
    };
  }

  hasAccess(menuItem: string): boolean {
    if (!this.currentUser) return false;
    const role = this.currentUser.roleId;
    if (role === 'super_admin') return true;

    switch (menuItem) {
      case 'dashboard':
        return true;
      case 'registration':
        return ['instructor', 'school_admin'].includes(role);
      case 'lms':
        return ['student', 'instructor', 'school_admin'].includes(role);
      case 'competitions':
        return ['student', 'instructor', 'school_admin', 'judge'].includes(role);
      case 'leaderboard':
        return ['student', 'instructor', 'school_admin', 'judge', 'sponsor'].includes(role);
      case 'talent':
        return ['instructor', 'sponsor'].includes(role);
      case 'sponsors':
        return ['sponsor'].includes(role);
      case 'reporting':
        return ['instructor', 'school_admin'].includes(role);
      default:
        return false;
    }
  }

  get currentTitle(): string {
    const hash = window.location.hash;
    const seg = hash.replace('#/', '').split('?')[0].split('/')[0] || 'dashboard';
    return this.pageTitles[seg] ?? 'STEM Portal';
  }
}
