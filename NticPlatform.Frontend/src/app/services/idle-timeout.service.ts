import { Injectable, OnDestroy, inject } from '@angular/core';
import { Subject, Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
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
 * the last-activity and last-heartbeat timestamps and compare against the clock,
 * which is correct no matter how long the tab was frozen.
 *
 * The check also runs on `visibilitychange`/`focus`/`pageshow`, so returning to
 * a stale tab is evaluated immediately instead of up to one poll interval later.
 *
 * The server enforces the same rule independently (see touch_session() in
 * app/security.py) -- this class is the UX half.
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

  /** How long before the deadline the "still there?" prompt appears (2 minutes). */
  readonly warnBeforeMs = 120 * 1000;

  /** Timestamp comparison is cheap; poll often enough for smooth countdown and prompt. */
  private readonly checkIntervalMs = 2_000;

  /**
   * Minimum gap between periodic server heartbeats during continuous activity.
   */
  private readonly heartbeatMinGapMs = 2 * 60 * 1000;

  /**
   * When user activity ceases, wait this duration and then flush a trailing
   * heartbeat. This ensures the server's idle deadline starts from the moment
   * the user actually stopped working, eliminating heartbeat gap drift.
   */
  private readonly trailingHeartbeatDelayMs = 20 * 1000;
  private trailingHeartbeatTimer: any = null;

  /** Persisted so a page reload inside the same tab does not reset the clock. */
  private readonly lastActivityKey = 'ntic_last_activity_at';
  private readonly lastHeartbeatKey = 'ntic_last_heartbeat_at';

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

    const now = Date.now();
    if (this.readLastActivity() === null) this.writeLastActivity(now);
    if (this.readLastHeartbeat() === null) this.writeLastHeartbeat(now);
    this.lastHeartbeatAt = this.readLastHeartbeat() || now;

    this.activityEvents.forEach(evt =>
      window.addEventListener(evt, this.onActivity, { passive: true })
    );
    document.addEventListener('visibilitychange', this.onVisible);
    window.addEventListener('focus', this.onVisible);
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
    if (this.trailingHeartbeatTimer) {
      clearTimeout(this.trailingHeartbeatTimer);
      this.trailingHeartbeatTimer = null;
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
    const now = Date.now();
    this.lastHeartbeatAt = now;
    this.activitySinceHeartbeat = false;
    this.writeLastActivity(now);
    this.writeLastHeartbeat(now);
    if (this.trailingHeartbeatTimer) {
      clearTimeout(this.trailingHeartbeatTimer);
      this.trailingHeartbeatTimer = null;
    }
  }

  /**
   * Called by the warning prompt's "Stay signed in" action.
   * Immediately resets client clocks and renews the server session.
   * Returns an Observable resolving to true if session was successfully slid forward.
   */
  continueSession(): Observable<boolean> {
    this.warningOpen = false;
    const now = Date.now();
    this.writeLastActivity(now);
    this.writeLastHeartbeat(now);
    this.lastHeartbeatAt = now;
    this.activitySinceHeartbeat = true;
    if (this.trailingHeartbeatTimer) {
      clearTimeout(this.trailingHeartbeatTimer);
      this.trailingHeartbeatTimer = null;
    }

    if (!getAuthValue('activeUserToken')) {
      return of(false);
    }

    return this.http.post<{ expires_in_seconds: number; session_idle_seconds: number }>(
      `${environment.apiUrl}/auth/heartbeat`, {}
    ).pipe(
      map(res => {
        this.setIdleLimitSeconds(res?.session_idle_seconds);
        this.activitySinceHeartbeat = false;
        const confirmedAt = Date.now();
        this.lastHeartbeatAt = confirmedAt;
        this.writeLastHeartbeat(confirmedAt);
        this.writeLastActivity(confirmedAt);
        return true;
      }),
      catchError(() => of(false))
    );
  }

  private recordActivity(): void {
    const now = Date.now();
    if (now - this.lastRecordedAt < 1000) return; // throttle
    this.lastRecordedAt = now;

    // While the warning prompt is open, only explicit choice dismisses it.
    if (this.warningOpen) return;

    this.writeLastActivity(now);
    this.activitySinceHeartbeat = true;

    if (now - this.lastHeartbeatAt >= this.heartbeatMinGapMs) {
      this.sendHeartbeat(false);
    } else {
      // Schedule trailing heartbeat flush after activity ceases
      if (this.trailingHeartbeatTimer) {
        clearTimeout(this.trailingHeartbeatTimer);
      }
      this.trailingHeartbeatTimer = setTimeout(() => {
        if (this.started && this.activitySinceHeartbeat && !this.warningOpen) {
          this.sendHeartbeat(true);
        }
      }, this.trailingHeartbeatDelayMs);
    }
  }

  private check(): void {
    if (!this.started) return;

    // Not signed in: nothing to expire, and no prompt should be shown.
    if (!getAuthValue('activeUserToken')) {
      this.warningOpen = false;
      return;
    }

    const now = Date.now();
    const lastActivity = this.readLastActivity();
    if (lastActivity === null) {
      this.writeLastActivity(now);
      this.writeLastHeartbeat(now);
      return;
    }

    const lastHeartbeat = this.readLastHeartbeat() ?? this.lastHeartbeatAt ?? lastActivity;

    const activityIdleFor = now - lastActivity;
    // Clock change or future timestamp guard
    if (activityIdleFor < 0) {
      this.writeLastActivity(now);
      this.writeLastHeartbeat(now);
      return;
    }

    const serverTimeRemaining = (lastHeartbeat + this.idleLimitMs) - now;
    const clientTimeRemaining = this.idleLimitMs - activityIdleFor;

    // If either client activity or server heartbeat time has fully expired
    if (clientTimeRemaining <= 0 || serverTimeRemaining <= 0) {
      this.warningOpen = false;
      this.expired$.next();
      return;
    }

    // True remaining time before session expires
    const msLeft = Math.min(clientTimeRemaining, serverTimeRemaining);

    if (msLeft <= this.warnBeforeMs) {
      const secondsLeft = Math.max(1, Math.ceil(msLeft / 1000));
      this.warningOpen = true;
      this.warning$.next(secondsLeft);
    } else if (this.warningOpen) {
      this.warningOpen = false;
      this.warningCleared$.next();
    }
  }

  /**
   * Tells the server the user is still active. Rate-limited, and skipped
   * entirely when there has been no activity since the last one.
   */
  private sendHeartbeat(force: boolean): void {
    if (!getAuthValue('activeUserToken')) return;
    if (!this.activitySinceHeartbeat && !force) return;
    const now = Date.now();
    if (!force && now - this.lastHeartbeatAt < this.heartbeatMinGapMs) return;

    this.lastHeartbeatAt = now;
    this.writeLastHeartbeat(now);
    this.activitySinceHeartbeat = false;
    if (this.trailingHeartbeatTimer) {
      clearTimeout(this.trailingHeartbeatTimer);
      this.trailingHeartbeatTimer = null;
    }

    this.http.post<{ expires_in_seconds: number; session_idle_seconds: number }>(
      `${environment.apiUrl}/auth/heartbeat`, {}
    ).subscribe({
      next: res => {
        this.setIdleLimitSeconds(res?.session_idle_seconds);
        const confirmedAt = Date.now();
        this.lastHeartbeatAt = confirmedAt;
        this.writeLastHeartbeat(confirmedAt);
      },
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
      /* storage unavailable - interval check re-seeds it */
    }
  }

  private readLastHeartbeat(): number | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.sessionStorage.getItem(this.lastHeartbeatKey);
      if (!raw) return null;
      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  }

  private writeLastHeartbeat(at: number): void {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(this.lastHeartbeatKey, String(at));
    } catch {
      /* storage unavailable */
    }
  }

  /** Clears the stored clock so a later login starts fresh. */
  clearStoredActivity(): void {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.removeItem(this.lastActivityKey);
      window.sessionStorage.removeItem(this.lastHeartbeatKey);
    } catch {
      /* ignore */
    }
    if (this.trailingHeartbeatTimer) {
      clearTimeout(this.trailingHeartbeatTimer);
      this.trailingHeartbeatTimer = null;
    }
  }

  ngOnDestroy(): void {
    this.stop();
  }
}
