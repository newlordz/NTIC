import { Injectable, OnDestroy, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { getAuthValue } from './session.util';
import { environment } from '../../environments/environment';

/**
 * Signs a user out after a period of inactivity.
 *
 * Why this is timestamp-based rather than a `setTimeout(logout, 30min)`:
 * browsers heavily throttle timers in background tabs, and a sleeping or
 * hibernating machine suspends them entirely. A pending timeout is therefore
 * NOT a reliable deadline -- the classic symptom being a user who closes the
 * lid, comes back the next morning and is still signed in. Instead we persist
 * the last-activity timestamp and compare it against the clock, which is
 * correct no matter how long the tab was frozen.
 *
 * The check also runs on `visibilitychange`/`focus`/`pageshow`, so returning to
 * a stale tab is evaluated immediately instead of up to one poll interval later.
 *
 * The server enforces the same rule independently (see touch_session() in
 * app/security.py) -- this class is the UX half. A client-side timer alone is
 * trivially bypassed, and the server alone cannot show a warning.
 */
@Injectable({ providedIn: 'root' })
export class IdleTimeoutService implements OnDestroy {
  private readonly http = inject(HttpClient);

  /**
   * Inactivity allowed before sign-out. Overwritten by the server's real policy
   * (`session_idle_seconds`) on login and on every heartbeat, so this is only
   * the value used before the first response arrives.
   *
   * Must be kept in step with SESSION_IDLE_MINUTES in app/security.py.
   */
  private idleLimitMs = 30 * 60 * 1000;

  /** How long before the deadline the "still there?" prompt appears. */
  readonly warnBeforeMs = 60 * 1000;

  /** Timestamp comparison is cheap, so poll often enough to feel instant. */
  private readonly checkIntervalMs = 5_000;

  /**
   * Minimum gap between server heartbeats. Activity is continuous, but the
   * server only needs an occasional nudge; this keeps one active tab down to
   * ~12 requests/hour instead of one per interaction.
   */
  private readonly heartbeatMinGapMs = 5 * 60 * 1000;

  /** Persisted so a page reload inside the same tab does not reset the clock. */
  private readonly lastActivityKey = 'ntic_last_activity_at';

  /** Emits when the idle limit is reached. AppComponent performs the sign-out. */
  readonly expired$ = new Subject<void>();
  /** Emits when the warning window opens. Payload is seconds remaining. */
  readonly warning$ = new Subject<number>();
  /** Emits when activity resumes and any open warning should be dismissed. */
  readonly warningCleared$ = new Subject<void>();

  private readonly activityEvents = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove', 'scroll'];
  private checkTimer: any = null;
  private started = false;
  private warningOpen = false;
  private lastHeartbeatAt = 0;
  private activitySinceHeartbeat = false;
  /** Throttle: sessionStorage writes on every mousemove would be wasteful. */
  private lastRecordedAt = 0;

  private readonly onActivity = () => this.recordActivity();
  private readonly onVisible = () => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') this.check();
  };

  /** Attaches listeners. Safe to call more than once. */
  start(): void {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;

    // Seed the clock so an existing session is not judged against a missing
    // timestamp (which would otherwise look infinitely idle).
    if (this.readLastActivity() === null) this.writeLastActivity(Date.now());

    this.activityEvents.forEach(evt =>
      window.addEventListener(evt, this.onActivity, { passive: true })
    );
    document.addEventListener('visibilitychange', this.onVisible);
    window.addEventListener('focus', this.onVisible);
    // Fired when a page is restored from the back/forward cache, where timers
    // were frozen the whole time.
    window.addEventListener('pageshow', this.onVisible);

    this.checkTimer = setInterval(() => this.check(), this.checkIntervalMs);
  }

  stop(): void {
    if (typeof window === 'undefined') return;
    this.started = false;
    this.warningOpen = false;
    this.activityEvents.forEach(evt => window.removeEventListener(evt, this.onActivity));
    document.removeEventListener('visibilitychange', this.onVisible);
    window.removeEventListener('focus', this.onVisible);
    window.removeEventListener('pageshow', this.onVisible);
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /** Adopt the server's policy so the client cannot drift out of step. */
  setIdleLimitSeconds(seconds: number): void {
    if (typeof seconds === 'number' && seconds > 0) {
      this.idleLimitMs = seconds * 1000;
    }
  }

  get idleLimitMinutes(): number {
    return Math.round(this.idleLimitMs / 60000);
  }

  /** Call right after a successful login to start the clock cleanly. */
  reset(): void {
    this.warningOpen = false;
    this.lastHeartbeatAt = Date.now();
    this.activitySinceHeartbeat = false;
    this.writeLastActivity(Date.now());
  }

  /** Called by the warning prompt's "Stay signed in" action. */
  continueSession(): void {
    this.warningOpen = false;
    this.writeLastActivity(Date.now());
    this.activitySinceHeartbeat = true;
    this.sendHeartbeat(true);
  }

  private recordActivity(): void {
    const now = Date.now();
    if (now - this.lastRecordedAt < 1000) return; // throttle
    this.lastRecordedAt = now;

    // While the warning is up, only an explicit choice should dismiss it.
    // Otherwise a stray mousemove from bumping the desk would silently cancel
    // a sign-out the user never actually acknowledged.
    if (this.warningOpen) return;

    this.writeLastActivity(now);
    this.activitySinceHeartbeat = true;
    this.sendHeartbeat(false);
  }

  private check(): void {
    if (!this.started) return;

    // Not signed in: nothing to expire, and no prompt should be shown.
    if (!getAuthValue('activeUserToken')) {
      this.warningOpen = false;
      return;
    }

    const last = this.readLastActivity();
    if (last === null) {
      this.writeLastActivity(Date.now());
      return;
    }

    const idleFor = Date.now() - last;

    // A clock change or a bogus future timestamp must not lock anyone out.
    if (idleFor < 0) {
      this.writeLastActivity(Date.now());
      return;
    }

    if (idleFor >= this.idleLimitMs) {
      this.warningOpen = false;
      this.expired$.next();
      return;
    }

    const msLeft = this.idleLimitMs - idleFor;
    if (msLeft <= this.warnBeforeMs) {
      if (!this.warningOpen) {
        this.warningOpen = true;
        this.warning$.next(Math.ceil(msLeft / 1000));
      }
    } else if (this.warningOpen) {
      this.warningOpen = false;
      this.warningCleared$.next();
    }
  }

  /**
   * Tells the server the user is still active. Rate-limited, and skipped
   * entirely when there has been no activity since the last one -- that is what
   * stops the app's own background polling from renewing an abandoned session.
   */
  private sendHeartbeat(force: boolean): void {
    if (!getAuthValue('activeUserToken')) return;
    if (!this.activitySinceHeartbeat) return;
    const now = Date.now();
    if (!force && now - this.lastHeartbeatAt < this.heartbeatMinGapMs) return;

    this.lastHeartbeatAt = now;
    this.activitySinceHeartbeat = false;
    this.http.post<{ expires_in_seconds: number; session_idle_seconds: number }>(
      `${environment.apiUrl}/auth/heartbeat`, {}
    ).subscribe({
      next: res => this.setIdleLimitSeconds(res?.session_idle_seconds),
      // A failure here is not fatal: the deadline is enforced server-side and
      // re-checked locally, so a dropped heartbeat cannot extend the session.
      error: () => {}
    });
  }

  private readLastActivity(): number | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.sessionStorage.getItem(this.lastActivityKey);
      if (!raw) return null;
      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  }

  private writeLastActivity(at: number): void {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(this.lastActivityKey, String(at));
    } catch {
      /* storage unavailable - the interval check simply re-seeds it */
    }
  }

  /** Clears the stored clock so a later login starts fresh. */
  clearStoredActivity(): void {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.removeItem(this.lastActivityKey);
    } catch {
      /* ignore */
    }
  }

  ngOnDestroy(): void {
    this.stop();
  }
}
