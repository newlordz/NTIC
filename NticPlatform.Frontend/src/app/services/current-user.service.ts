import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, from } from 'rxjs';
import { catchError, shareReplay, tap, switchMap } from 'rxjs/operators';
import { ApiService, MyProfile } from './api.service';
import { getAuthValue, setAuthValue } from './session.util';
import { FileStorageService } from './file-storage.service';

/**
 * The signed-in user's real identity, fetched once from GET /api/users/me.
 *
 * Why this service exists
 * -----------------------
 * `GET /api/users` is admin-only, but four separate surfaces were searching that
 * list for the current user to find their own name:
 *
 *   - the sidebar name + avatar   (app.component.ts loadUserProfile)
 *   - the dashboard greeting      (dashboard.component.ts loadDashboardData)
 *   - the LMS student profile     (lms.component.ts studentProfile)
 *   - the profile-completion form (profile-completion.component.ts ngOnInit)
 *
 * For a student, judge, sponsor or instructor the request 403s, the list stays
 * empty, and every one of those lookups silently fell through to a hardcoded
 * fixture. A real student was greeted "Welcome back, Administrator" above a
 * sidebar reading "Kwame Asante", and the profile form prefilled itself with
 * "Super Admin" / "NTIC Ghana Administration".
 *
 * A second, subtler bug fed the same problem: login writes the name with
 * `user.fullName`, but the API returns `full_name`, so `activeUserName` was
 * always undefined and the fallback chain never had anything to fall back to.
 *
 * This service is the single answer to "who am I", available to every role.
 * Consumers read `profile()` (or subscribe to `profile$`) and get real data or
 * null -- never a fixture pretending to be real data.
 */
@Injectable({ providedIn: 'root' })
export class CurrentUserService {
  private readonly _profile$ = new BehaviorSubject<MyProfile | null>(null);

  /** Emits the profile once loaded, then on every refresh. */
  readonly profile$: Observable<MyProfile | null> = this._profile$.asObservable();

  private inFlight: Observable<MyProfile | null> | null = null;

  constructor(private api: ApiService, private fileStorage: FileStorageService) {}

  /** Last known profile, or null if not loaded / not signed in. */
  profile(): MyProfile | null {
    return this._profile$.value;
  }

  /**
   * Loads the profile if it is not already cached.
   *
   * Concurrent callers share one request: the app shell, the dashboard and the
   * LMS page all want this during the same tick, and three identical requests on
   * every navigation is waste.
   */
  ensureLoaded(): Observable<MyProfile | null> {
    if (this._profile$.value) return of(this._profile$.value);
    if (this.inFlight) return this.inFlight;
    return this.refresh();
  }

  /** Forces a re-fetch, e.g. straight after the user edits their own profile. */
  refresh(): Observable<MyProfile | null> {
    if (!getAuthValue('activeUserToken')) {
      this._profile$.next(null);
      return of(null);
    }

    const request = this.api.getMyProfile().pipe(
      tap((profile: MyProfile) => {
        this._profile$.next(profile);
        this.cacheForSynchronousReaders(profile);
        this.inFlight = null;
      }),
      catchError(() => {
        // A failure here must not blank out a good cached profile, and it must
        // not throw: this runs during app startup on every page load.
        this.inFlight = null;
        return of(this._profile$.value);
      }),
      // shareReplay is what actually makes concurrent callers share one request.
      // Without it the pipeline is cold, so the shell, the dashboard and the LMS
      // page each subscribing in the same tick would fire three identical
      // requests instead of one.
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.inFlight = request;
    return request;
  }

  /** Clears cached identity. Call on logout so the next user starts clean. */
  clear(): void {
    this._profile$.next(null);
    this.inFlight = null;
  }

  /** Convenience accessors used by templates. */
  displayName(): string {
    return this._profile$.value?.full_name?.trim() || getAuthValue('activeUserName') || '';
  }

  initials(): string {
    const name = this.displayName().trim();
    if (!name) return '';
    const parts = name.split(/\s+/).filter(Boolean);
    const letters = parts.length > 1
      ? parts[0][0] + parts[parts.length - 1][0]
      : parts[0].slice(0, 2);
    return letters.toUpperCase();
  }

  /** Returns true if the user has a profile photo uploaded. */
  hasPhoto(): boolean {
    return !!this._profile$.value?.photo_file_id;
  }

  /** Returns the profile photo URL as an Observable, or null if no photo. */
  photoUrl$(): Observable<string | null> {
    const fileId = this._profile$.value?.photo_file_id;
    if (!fileId) return of(null);
    return from(this.fileStorage.getUrl(fileId));
  }

  /** Returns the avatar for the user: either the profile photo URL or initials. */
  avatar$(): Observable<{ url: string | null; initials: string }> {
    const fileId = this._profile$.value?.photo_file_id;
    if (!fileId) return of({ url: null, initials: this.initials() });
    return from(this.fileStorage.getUrl(fileId)).pipe(
      switchMap(url => of({ url, initials: this.initials() }))
    );
  }

  /**
   * The id to use for student-owned records.
   *
   * Server-provisioned and stable. Replaces the previous client-side
   * `'NTIC-STU-' + Math.random()`, which lived in a getter and so returned a
   * different value on every read -- progress was written under keys that were
   * never read back, and submissions failed a foreign key every time.
   */
  studentId(): string | null {
    return this._profile$.value?.student_id ?? null;
  }

  /**
   * Mirrors a couple of fields into sessionStorage.
   *
   * Several older call sites read `activeUserName` synchronously during change
   * detection and cannot await an observable. Writing it here also finally fixes
   * the `full_name` vs `fullName` casing bug at the point where the value is
   * actually known to be correct.
   */
  private cacheForSynchronousReaders(profile: MyProfile): void {
    if (profile.full_name) setAuthValue('activeUserName', profile.full_name);
    if (profile.email) setAuthValue('activeUserEmail', profile.email);
    if (profile.ticket) setAuthValue('activeUserTicket', profile.ticket);
    if (profile.role) setAuthValue('activeRoleId', profile.role);
  }
}
