import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { CurrentUserService } from './current-user.service';
import { ApiService, MyProfile } from './api.service';
import { environment } from '../../environments/environment';

/**
 * These tests lock down the fix for the identity bug: GET /api/users is
 * admin-only, so four separate surfaces that searched it for the signed-in user
 * always missed and fell back to hardcoded fixtures. A real student was greeted
 * "Welcome back, Administrator" under a sidebar reading "Kwame Asante".
 */
describe('CurrentUserService', () => {
  let service: CurrentUserService;
  let http: HttpTestingController;

  const profile: MyProfile = {
    id: 'usr-1', email: 'ama@school.test', full_name: 'Ama Boateng',
    role: 'student', ticket: 'NTIC-STU-0042', status: 'Active',
    phone: null, organization: 'Achimota School',
    must_change_password: false, password_changed_at: null, password_min_length: 10,
    bio: '', expertise: '', sector: '', rep_name: '', experience_level: '', tier: '',
    track: 'Robotics', student_id: 'usr-1', photo_file_id: null,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [CurrentUserService, ApiService],
    });
    service = TestBed.inject(CurrentUserService);
    http = TestBed.inject(HttpTestingController);
    sessionStorage.clear();
    sessionStorage.setItem('activeUserToken', 'tok-abc');
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  function flush(body: MyProfile | null = profile, status = 200) {
    const req = http.expectOne(`${environment.apiUrl}/users/me`);
    if (status === 200) req.flush(body);
    else req.flush({ detail: 'nope' }, { status, statusText: 'Error' });
    return req;
  }

  it('loads the profile from GET /api/users/me', () => {
    let seen: MyProfile | null = null;
    service.ensureLoaded().subscribe(p => (seen = p));
    flush();
    expect(seen!.full_name).toBe('Ama Boateng');
    expect(service.profile()!.role).toBe('student');
  });

  it('does not re-request once cached', () => {
    service.ensureLoaded().subscribe();
    flush();
    service.ensureLoaded().subscribe();
    http.expectNone(`${environment.apiUrl}/users/me`);
  });

  it('shares one request between concurrent callers', () => {
    // The shell, the dashboard and the LMS page all ask during the same tick.
    service.ensureLoaded().subscribe();
    service.ensureLoaded().subscribe();
    service.ensureLoaded().subscribe();
    flush();
    expect(service.profile()).toBeTruthy();
  });

  it('skips the request entirely when there is no token', () => {
    sessionStorage.removeItem('activeUserToken');
    let seen: MyProfile | null | undefined;
    service.ensureLoaded().subscribe(p => (seen = p));
    http.expectNone(`${environment.apiUrl}/users/me`);
    expect(seen).toBeNull();
  });

  it('returns null rather than throwing when the request fails', () => {
    // This runs during app startup on every page load; it must not break boot.
    let seen: MyProfile | null | undefined;
    let errored = false;
    service.ensureLoaded().subscribe({
      next: p => (seen = p),
      error: () => (errored = true),
    });
    flush(null, 500);
    expect(errored).toBeFalse();
    expect(seen).toBeNull();
  });

  it('keeps the cached profile if a later refresh fails', () => {
    service.ensureLoaded().subscribe();
    flush();
    service.refresh().subscribe();
    flush(null, 503);
    expect(service.profile()!.full_name).toBe('Ama Boateng');
  });

  // ── the casing bug ────────────────────────────────────────────────────
  it('writes activeUserName, which login never did', () => {
    // Login checked `user.fullName` but the API returns `full_name`, so this key
    // was never set and every fallback chain had nothing to fall back to.
    expect(sessionStorage.getItem('activeUserName')).toBeNull();
    service.ensureLoaded().subscribe();
    flush();
    expect(sessionStorage.getItem('activeUserName')).toBe('Ama Boateng');
  });

  it('caches email, ticket and role for synchronous readers', () => {
    service.ensureLoaded().subscribe();
    flush();
    expect(sessionStorage.getItem('activeUserEmail')).toBe('ama@school.test');
    expect(sessionStorage.getItem('activeUserTicket')).toBe('NTIC-STU-0042');
    expect(sessionStorage.getItem('activeRoleId')).toBe('student');
  });

  // ── stable student id ─────────────────────────────────────────────────
  it('exposes a stable student id', () => {
    service.ensureLoaded().subscribe();
    flush();
    // The old client-side id was 'NTIC-STU-' + Math.random() inside a getter, so
    // it changed on every read and nothing could be read back.
    const first = service.studentId();
    expect(first).toBe('usr-1');
    expect(service.studentId()).toBe(first);
    expect(service.studentId()).toBe(first);
  });

  it('reports no student id for a non-student role', () => {
    service.ensureLoaded().subscribe();
    flush({ ...profile, role: 'judge', student_id: null });
    expect(service.studentId()).toBeNull();
  });

  // ── display helpers ───────────────────────────────────────────────────
  it('derives initials from the real name', () => {
    service.ensureLoaded().subscribe();
    flush();
    expect(service.initials()).toBe('AB');
  });

  it('derives initials from a single-word name', () => {
    service.ensureLoaded().subscribe();
    flush({ ...profile, full_name: 'Adjoa' });
    expect(service.initials()).toBe('AD');
  });

  it('returns empty display values when nothing is known', () => {
    sessionStorage.removeItem('activeUserToken');
    service.ensureLoaded().subscribe();
    expect(service.displayName()).toBe('');
    expect(service.initials()).toBe('');
  });

  it('clear() drops the cached identity so the next user starts clean', () => {
    service.ensureLoaded().subscribe();
    flush();
    service.clear();
    expect(service.profile()).toBeNull();
    // A fresh load must hit the network again.
    service.ensureLoaded().subscribe();
    flush();
    expect(service.profile()!.full_name).toBe('Ama Boateng');
  });

  it('refresh() re-reads after a profile edit', () => {
    service.ensureLoaded().subscribe();
    flush();
    service.refresh().subscribe();
    flush({ ...profile, full_name: 'Ama B. Mensah' });
    expect(service.displayName()).toBe('Ama B. Mensah');
    expect(sessionStorage.getItem('activeUserName')).toBe('Ama B. Mensah');
  });
});
