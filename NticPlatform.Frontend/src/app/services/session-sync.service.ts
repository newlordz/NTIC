import { Injectable, OnDestroy, inject } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import {
  getAuthValue,
  getSessionSnapshot,
  restoreSessionSnapshot,
  SessionSnapshot
} from './session.util';
import { CurrentUserService } from './current-user.service';

interface SessionRequestMsg {
  type: 'SESSION_REQUEST';
  requestId: string;
}

interface SessionOfferMsg {
  type: 'SESSION_OFFER';
  requestId: string;
  snapshot: SessionSnapshot;
}

interface SessionRevokedMsg {
  type: 'SESSION_REVOKED';
}

type SyncMessage = SessionRequestMsg | SessionOfferMsg | SessionRevokedMsg;

@Injectable({
  providedIn: 'root'
})
export class SessionSyncService implements OnDestroy {
  private readonly currentUserService = inject(CurrentUserService);
  private channel: BroadcastChannel | null = null;
  private pendingRequests = new Map<string, { resolve: (val: boolean) => void; timer: any }>();
  private readonly _sessionRevoked$ = new Subject<void>();

  readonly sessionRevoked$: Observable<void> = this._sessionRevoked$.asObservable();

  constructor() {
    this.init();
  }

  /**
   * Initializes the BroadcastChannel listener for cross-tab session handoff.
   * Safe to call multiple times (idempotent).
   */
  init(): void {
    if (this.channel || typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
      return;
    }

    try {
      this.channel = new BroadcastChannel('ntic_session_sync');
      this.channel.onmessage = (event: MessageEvent<SyncMessage>) => {
        this.handleMessage(event.data);
      };
    } catch {
      this.channel = null;
    }
  }

  private handleMessage(data: SyncMessage): void {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'SESSION_REQUEST': {
        const snapshot = getSessionSnapshot();
        if (snapshot && snapshot.activeUserToken && this.channel) {
          this.channel.postMessage({
            type: 'SESSION_OFFER',
            requestId: data.requestId,
            snapshot
          } as SessionOfferMsg);
        }
        break;
      }

      case 'SESSION_OFFER': {
        const pending = this.pendingRequests.get(data.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(data.requestId);

          if (data.snapshot && data.snapshot.activeUserToken) {
            restoreSessionSnapshot(data.snapshot);
            this.currentUserService.refresh();
            pending.resolve(true);
          } else {
            pending.resolve(false);
          }
        }
        break;
      }

      case 'SESSION_REVOKED': {
        this._sessionRevoked$.next();
        break;
      }
    }
  }

  /**
   * Requests authentication credentials from any existing active tab in-memory.
   * Resolves to true if credentials were provided and restored, false otherwise.
   * Never stores tokens on disk or localStorage.
   */
  async requestSessionFromExistingTabs(timeoutMs: number = 300): Promise<boolean> {
    if (getAuthValue('activeUserToken')) {
      return true;
    }

    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
      return false;
    }

    this.init();
    if (!this.channel) {
      return false;
    }

    const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        resolve(false);
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, timer });

      try {
        this.channel?.postMessage({
          type: 'SESSION_REQUEST',
          requestId
        } as SessionRequestMsg);
      } catch {
        clearTimeout(timer);
        this.pendingRequests.delete(requestId);
        resolve(false);
      }
    });
  }

  /**
   * Broadcasts across tabs that the session has been terminated.
   */
  broadcastLogout(): void {
    if (this.channel) {
      try {
        this.channel.postMessage({ type: 'SESSION_REVOKED' } as SessionRevokedMsg);
      } catch {}
    }
  }

  destroy(): void {
    for (const [, req] of this.pendingRequests) {
      clearTimeout(req.timer);
      req.resolve(false);
    }
    this.pendingRequests.clear();

    if (this.channel) {
      try {
        this.channel.close();
      } catch {}
      this.channel = null;
    }
  }

  ngOnDestroy(): void {
    this.destroy();
  }
}
