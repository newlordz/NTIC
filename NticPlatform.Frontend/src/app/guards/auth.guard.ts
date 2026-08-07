import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { getAuthValue } from '../services/session.util';
import { environment } from '../../environments/environment';

const ROLE_ACCESS: Record<string, string[]> = {
  'dashboard':        ['super_admin', 'admin', 'content_manager', 'reviewer', 'competition_manager', 'school_admin'],
  'lms':              ['student', 'instructor', 'super_admin', 'admin'],
  'lms-manager':      ['super_admin', 'admin', 'content_manager', 'instructor'],
  'instructor':       ['instructor', 'super_admin', 'admin'],
  'judge':            ['judge', 'super_admin', 'admin'],
  'sponsors':         ['sponsor', 'super_admin', 'admin'],
  'reporting':        ['super_admin', 'admin', 'reviewer'],
  'records':          ['super_admin', 'admin', 'content_manager'],
  'user-management':  ['super_admin'],
  'profile-completion': ['super_admin', 'admin', 'content_manager', 'reviewer', 'competition_manager', 'judge', 'sponsor', 'instructor', 'student', 'school_admin'],
};

let verifiedRole: string | null = null;

export const authGuard: CanActivateFn = async (_route, state) => {
  const router = inject(Router);
  const token = getAuthValue('activeUserToken');
  const path = (state.url || '').replace(/^\//, '').split('?')[0];

  const allowed = ROLE_ACCESS[path];
  if (!allowed || allowed.length === 0) return true;

  if (!token) {
    verifiedRole = null;
    router.navigate(['/']);
    return false;
  }

  // Use previously verified role from server — never trust client storage
  if (verifiedRole) {
    if (!allowed.includes(verifiedRole)) {
      router.navigate(['/']);
      return false;
    }
    return true;
  }

  // Verify token with backend on first access
  try {
    const http = inject(HttpClient);
    const res = await firstValueFrom(http.get<{ role: string; email: string }>(`${environment.apiUrl}/auth/verify`));
    verifiedRole = res.role;
    if (!allowed.includes(verifiedRole)) {
      verifiedRole = null;
      router.navigate(['/']);
      return false;
    }
    return true;
  } catch {
    verifiedRole = null;
    router.navigate(['/']);
    return false;
  }
};
