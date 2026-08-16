import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { getAuthValue } from './session.util';

@Injectable({ providedIn: 'root' })
export class WsSyncService {
  private ws: WebSocket | null = null;
  private reconnectHandle: any = null;
  private pingHandle: any = null;
  private connected = false;

  private readonly _dataChanged = new Subject<string | undefined>();
  readonly dataChanged$ = this._dataChanged.asObservable();

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
      this.pingHandle = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send('ping');
        } else {
          clearInterval(this.pingHandle);
        }
      }, 25000);
    };

    this.ws.onmessage = (event) => {
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
      this.connected = false;
      this.ws = null;
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.connected = false;
      this.ws = null;
      this.scheduleReconnect();
    };
  }

  disconnect(): void {
    this.connected = false;
    if (this.reconnectHandle) { clearTimeout(this.reconnectHandle); this.reconnectHandle = null; }
    if (this.pingHandle) { clearInterval(this.pingHandle); this.pingHandle = null; }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectHandle) return;
    this.reconnectHandle = setTimeout(() => {
      this.reconnectHandle = null;
      this.connect();
    }, 5000);
  }
}
