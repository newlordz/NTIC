import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { getAuthValue } from './session.util';

@Injectable({ providedIn: 'root' })
export class WsSyncService {
  private ws: WebSocket | null = null;
  private reconnectHandle: any = null;
  private connected = false;

  /** Fires every time the backend notifies of a data change. */
  private readonly _dataChanged = new Subject<void>();
  readonly dataChanged$ = this._dataChanged.asObservable();

  connect(): void {
    if (this.connected) return;
    const token = getAuthValue('activeUserToken');
    if (!token) return;

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
      // ping every 25 s to keep the connection alive
      const ping = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send('ping');
        } else {
          clearInterval(ping);
        }
      }, 25000);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'data_changed') {
          this._dataChanged.next();
        }
      } catch { /* ignore malformed */ }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.ws = null;
    };

    this.ws.onerror = () => {
      this.connected = false;
      this.ws = null;
      this.scheduleReconnect();
    };
  }

  disconnect(): void {
    this.connected = false;
    if (this.reconnectHandle) {
      clearTimeout(this.reconnectHandle);
      this.reconnectHandle = null;
    }
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
    }, 3000);
  }
}
