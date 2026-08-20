import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { clearAllAuthValues, getAuthValue } from '../services/session.util';
import { environment } from '../../environments/environment';
import {
  ALL_ROLES, ADMIN_ROLES, COMPETITION_ROLES, GRADING_ROLES, LMS_ROLES,
  STUDENT_ADMIN_ROLES, CONTENT_ROLES, unionRoles,
  ROLE_SPONSOR, ROLE_STUDENT, ROLE_REVIEWER, ROLE_INSTRUCTOR, ROLE_SCHOOL_ADMIN
} from '../services/roles';

/**
 * Which roles may open which route.
 *
 * This is a UX gate only. The backend enforces permissions independently, so a
 * gap here is not a security hole on its own -- but a route missing from this
 * map used to be treated as PUBLIC, which meant a newly added guarded route was
 * silently unprotected. The guard now fails CLOSED instead.
 *
 * Entries are expressed with the shared role sets from services/roles.ts, which
 * mirror security.py. Listing raw role strings here is what let this map drift
 * away from the API: routes admitted roles the API rejects, so the page loaded
 * and then every action on it returned 403.
 */
const ROLE_ACCESS: Record<string, readonly string[]> = {
  // The shared shell every signed-in role lands on.
  'dashboard':          ALL_ROLES,
  'profile-completion': ALL_ROLES,

  // Cycle management. Must match COMPETITION_ROLES: the competitions API rejects
  // everyone else, so admitting more roles here only produces 403 walls.
  'admin/competitions': COMPETITION_ROLES,

  // Students consume the LMS; LMS_ROLES author it.
  'lms':                unionRoles(LMS_ROLES, [ROLE_STUDENT]),
  'lms-manager':        LMS_ROLES,

  'sponsors':           unionRoles(ADMIN_ROLES, [ROLE_SPONSOR]),

  // Mirrors the backend's GRADING_ROLES.
  'judge':              GRADING_ROLES,

  'reporting':          unionRoles(ADMIN_ROLES, [ROLE_REVIEWER, ROLE_INSTRUCTOR, ROLE_SCHOOL_ADMIN]),

  // Student and school records. STUDENT_ADMIN_ROLES governs student writes and
  // COMPETITION_ROLES governs school writes; CONTENT_ROLES is included because
  // content managers had read access here before and listing endpoints only
  // require authentication. Roles outside the write sets get a read-only view,
  // so the panel must keep hiding mutation controls from them.
  'records':            unionRoles(STUDENT_ADMIN_ROLES, COMPETITION_ROLES, CONTENT_ROLES),

  'user-management':    ADMIN_ROLES,
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
