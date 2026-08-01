import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { getAuthValue } from '../services/session.util';

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
  'profile-completion': ['judge', 'sponsor', 'instructor', 'student', 'school_admin'],
};

export const authGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  const role = getAuthValue('activeRoleId');
  const path = (state.url || '').replace(/^\//, '').split('?')[0];

  const allowed = ROLE_ACCESS[path];
  if (!allowed) return true;
  if (allowed.length === 0) return true;

  if (!role) {
    router.navigate(['/']);
    return false;
  }

  if (!allowed.includes(role)) {
    router.navigate(['/']);
    return false;
  }

  return true;
};
