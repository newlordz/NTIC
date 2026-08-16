import { TestBed } from '@angular/core/testing';
import { Router, RouterStateSnapshot, ActivatedRouteSnapshot } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { authGuard, resetVerifiedRoleCache } from './auth.guard';
import { environment } from '../../environments/environment';

/**
 * The guard is a UX gate (the backend enforces permissions independently), but
 * these tests pin down the three behaviours that were previously wrong:
 * fail-open on unknown routes, a role cache that survived logout, and a
 * fallback to the user-editable role in client storage.
 */
describe('authGuard', () => {
  let router: jasmine.SpyObj<Router>;
  let httpMock: HttpTestingController;

  const run = (url: string) =>
    TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot)
    ) as Promise<boolean>;

  const verifyUrl = `${environment.apiUrl}/auth/verify`;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetVerifiedRoleCache();
    router = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
    localStorage.clear();
    resetVerifiedRoleCache();
  });

  const signIn = (token = 'tok-abc') => sessionStorage.setItem('activeUserToken', token);

  it('redirects to the landing page when there is no token', async () => {
    const allowed = await run('/dashboard');
    expect(allowed).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });

  it('allows a permitted role after the server verifies it', async () => {
    signIn();
    const result = run('/user-management');
    httpMock.expectOne(verifyUrl).flush({ role: 'super_admin', email: 'a@b.com' });
    expect(await result).toBeTrue();
  });

  it('denies a role that is not permitted for the route', async () => {
    signIn();
    const result = run('/user-management');
    httpMock.expectOne(verifyUrl).flush({ role: 'student', email: 'a@b.com' });
    expect(await result).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  // Regression: an unknown path used to `return true` before any token check,
  // so any guarded route missing from ROLE_ACCESS was silently public.
  it('FAILS CLOSED for a guarded route that is not listed in ROLE_ACCESS', async () => {
    signIn();
    const allowed = await run('/some-new-admin-page');
    expect(allowed).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });

  it('covers admin/competitions, which was previously unlisted and so unguarded', async () => {
    signIn();
    const result = run('/admin/competitions');
    httpMock.expectOne(verifyUrl).flush({ role: 'student', email: 'a@b.com' });
    expect(await result).toBeFalse();
  });

  // Regression: the role cache was keyed by nothing and never cleared, so
  // logging out of an admin account and back in as a student in the same tab
  // left the student holding the admin's verified role.
  it('does not reuse a verified role after the token changes', async () => {
    signIn('admin-token');
    const first = run('/user-management');
    httpMock.expectOne(verifyUrl).flush({ role: 'super_admin', email: 'admin@b.com' });
    expect(await first).toBeTrue();

    // Same tab, different user.
    signIn('student-token');
    const second = run('/user-management');
    httpMock.expectOne(verifyUrl).flush({ role: 'student', email: 'stu@b.com' });
    expect(await second).toBeFalse();
  });

  it('reuses the cached role for the same token without re-verifying', async () => {
    signIn();
    const first = run('/records');
    httpMock.expectOne(verifyUrl).flush({ role: 'super_admin', email: 'a@b.com' });
    expect(await first).toBeTrue();

    // No second HTTP call expected; httpMock.verify() in afterEach enforces it.
    expect(await run('/records')).toBeTrue();
  });

  it('clears the cache so a later navigation re-verifies', async () => {
    signIn();
    const first = run('/records');
    httpMock.expectOne(verifyUrl).flush({ role: 'super_admin', email: 'a@b.com' });
    expect(await first).toBeTrue();

    resetVerifiedRoleCache();

    const second = run('/records');
    httpMock.expectOne(verifyUrl).flush({ role: 'super_admin', email: 'a@b.com' });
    expect(await second).toBeTrue();
  });

  // Regression: on any verify failure the guard fell back to
  // getAuthValue('activeRoleId'), which the user can edit. Blocking one request
  // was enough to self-assign any role.
  it('does NOT trust the role stored in client storage when verification fails', async () => {
    signIn();
    sessionStorage.setItem('activeRoleId', 'super_admin');
    const result = run('/user-management');
    httpMock.expectOne(verifyUrl).error(new ProgressEvent('network error'), { status: 0 });
    expect(await result).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });

  it('clears the session when the server rejects the token', async () => {
    signIn();
    sessionStorage.setItem('activeRoleId', 'super_admin');
    const result = run('/dashboard');
    httpMock.expectOne(verifyUrl).flush({ detail: 'Invalid token' }, { status: 401, statusText: 'Unauthorized' });
    expect(await result).toBeFalse();
    expect(sessionStorage.getItem('activeUserToken')).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });

  it('keeps the session on a transient server error', async () => {
    signIn();
    const result = run('/dashboard');
    httpMock.expectOne(verifyUrl).flush({}, { status: 503, statusText: 'Service Unavailable' });
    expect(await result).toBeFalse();
    // Not signed out: a blip must not destroy a valid session.
    expect(sessionStorage.getItem('activeUserToken')).toBe('tok-abc');
  });

  it('ignores query strings and fragments when matching the route', async () => {
    signIn();
    const result = run('/dashboard?action=add_team#top');
    httpMock.expectOne(verifyUrl).flush({ role: 'student', email: 'a@b.com' });
    expect(await result).toBeTrue();
  });
});
