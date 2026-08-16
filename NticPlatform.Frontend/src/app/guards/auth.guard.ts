import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { clearAllAuthValues, getAuthValue } from '../services/session.util';
import { environment } from '../../environments/environment';

/**
 * Which roles may open which route.
 *
 * This is a UX gate only. The backend enforces permissions independently, so a
 * gap here is not a security hole on its own -- but a route missing from this
 * map used to be treated as PUBLIC, which meant a newly added guarded route was
 * silently unprotected. The guard now fails CLOSED instead.
 */
const ROLE_ACCESS: Record<string, string[]> = {
  'dashboard':        ['super_admin', 'admin', 'content_manager', 'reviewer', 'competition_manager', 'school_admin', 'instructor', 'student', 'judge', 'sponsor', 'support_admin'],
  'admin/competitions': ['super_admin', 'admin', 'competition_manager', 'content_manager', 'support_admin', 'school_admin', 'instructor'],
  'lms':              ['student', 'instructor', 'super_admin', 'admin'],
  'lms-manager':      ['super_admin', 'admin', 'content_manager', 'instructor'],
  'instructor':       ['instructor', 'super_admin', 'admin'],
  'judge':            ['judge', 'super_admin', 'admin'],
  'sponsors':         ['sponsor', 'super_admin', 'admin'],
  'reporting':        ['super_admin', 'admin', 'reviewer', 'instructor', 'school_admin'],
  'records':          ['super_admin', 'admin', 'content_manager'],
  'user-management':  ['super_admin', 'admin'],
  'profile-completion': ['super_admin', 'admin', 'content_manager', 'reviewer', 'competition_manager', 'judge', 'sponsor', 'instructor', 'student', 'school_admin'],
};

/**
 * Server-verified role, cached so that navigating between guarded routes does
 * not re-hit /auth/verify on every click.
 *
 * Keyed by token: if the token changes (logout then login as someone else, in
 * the same tab) the cache no longer applies. The previous version cached only
 * the role string and never reset it, so signing out of an admin account and
 * back in as a student left the student holding the admin's verified role.
 */
let cache: { token: string; role: string } | null = null;

/** Called on logout so nothing survives into the next session. */
export function resetVerifiedRoleCache(): void {
  cache = null;
}

export const authGuard: CanActivateFn = async (_route, state) => {
  const router = inject(Router);
  const token = getAuthValue('activeUserToken');
  const path = (state.url || '').replace(/^\//, '').split('?')[0].split('#')[0];

  const allowed = ROLE_ACCESS[path];

  if (!token) {
    cache = null;
    router.navigate(['/']);
    return false;
  }

  // Fail closed. An unrecognised guarded route is a configuration mistake, and
  // the safe response is to deny rather than to wave it through.
  if (!allowed || allowed.length === 0) {
    console.error(
      `[authGuard] Route "${path}" is guarded but missing from ROLE_ACCESS. ` +
      `Denying access. Add it to ROLE_ACCESS in auth.guard.ts.`
    );
    router.navigate(['/']);
    return false;
  }

  if (cache && cache.token === token) {
    if (!allowed.includes(cache.role)) {
      router.navigate(['/dashboard']);
      return false;
    }
    return true;
  }

  try {
    const http = inject(HttpClient);
    const res = await firstValueFrom(
      http.get<{ role: string; email: string }>(`${environment.apiUrl}/auth/verify`)
    );
    cache = { token, role: res.role };
    if (!allowed.includes(res.role)) {
      // Authenticated but not permitted here: send them somewhere they can go
      // rather than logging them out.
      router.navigate(['/dashboard']);
      return false;
    }
    return true;
  } catch (err) {
    cache = null;

    // The server said the session is invalid. Clear it and go to the landing
    // page; keeping it would leave the UI in a signed-in-looking state.
    const status = err instanceof HttpErrorResponse ? err.status : 0;
    if (status === 401 || status === 403) {
      clearAllAuthValues();
      router.navigate(['/']);
      return false;
    }

    // Anything else (offline, 5xx, timeout) is inconclusive. Deny this
    // navigation but keep the session, so a transient blip does not sign the
    // user out. Notably we do NOT fall back to the role in client storage --
    // that value is user-editable, so blocking one request was enough to
    // self-assign any role.
    console.warn(`[authGuard] Could not verify the session (status ${status}). Denying navigation.`);
    router.navigate(['/']);
    return false;
  }
};
