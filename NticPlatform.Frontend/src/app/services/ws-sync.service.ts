import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { getAuthValue } from './session.util';

@Injectable({ providedIn: 'root' })
export class WsSyncService {
  private ws: WebSocket | null = null;
  private reconnectHandle: any = null;
  private pingHandle: any = null;
  private pongTimeoutHandle: any = null;
  private connected = false;
  private visibilityListenerAttached = false;

  private readonly _dataChanged = new Subject<string | undefined>();
  readonly dataChanged$ = this._dataChanged.asObservable();

  constructor() {
    this.initVisibilityListener();
  }

  private initVisibilityListener(): void {
    if (this.visibilityListenerAttached || typeof document === 'undefined') return;
    this.visibilityListenerAttached = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        const token = getAuthValue('activeUserToken');
        if (token && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
          this.connect();
        }
      }
    });
  }

  connect(): void {
    const token = getAuthValue('activeUserToken');
    if (!token) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    this.disconnect();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/api/ws?token=${encodeURIComponent(token)}`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      if (event.data === 'pong') {
        this.clearPongTimeout();
        return;
      }

      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'data_changed') {
          // Pass the collection through so consumers can do a targeted reload
          // instead of refetching everything.
          this._dataChanged.next(typeof msg.collection === 'string' ? msg.collection : undefined);
        }
      } catch { /* ignore */ }
    };

    this.ws.onclose = () => {
      this.cleanupSocket();
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.cleanupSocket();
      this.scheduleReconnect();
    };
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.pingHandle = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send('ping');
          // If no pong arrives within 10 seconds, force close and reconnect
          this.pongTimeoutHandle = setTimeout(() => {
            if (this.ws) {
              try { this.ws.close(); } catch { /* ignore */ }
            }
          }, 10000);
        } catch {
          this.cleanupSocket();
          this.scheduleReconnect();
        }
      } else {
        this.clearHeartbeat();
      }
    }, 25000);
  }

  private clearPongTimeout(): void {
    if (this.pongTimeoutHandle) {
      clearTimeout(this.pongTimeoutHandle);
      this.pongTimeoutHandle = null;
    }
  }

  private clearHeartbeat(): void {
    if (this.pingHandle) {
      clearInterval(this.pingHandle);
      this.pingHandle = null;
    }
    this.clearPongTimeout();
  }

  private cleanupSocket(): void {
    this.connected = false;
    this.clearHeartbeat();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      this.ws = null;
    }
  }

  disconnect(): void {
    if (this.reconnectHandle) {
      clearTimeout(this.reconnectHandle);
      this.reconnectHandle = null;
    }
    this.cleanupSocket();
  }

  private scheduleReconnect(): void {
    if (this.reconnectHandle) return;
    this.reconnectHandle = setTimeout(() => {
      this.reconnectHandle = null;
      this.connect();
    }, 5000);
  }
}

