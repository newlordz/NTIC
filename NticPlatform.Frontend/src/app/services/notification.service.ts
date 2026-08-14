import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  durationMs?: number;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private toastsSubject = new BehaviorSubject<ToastMessage[]>([]);
  public toasts$: Observable<ToastMessage[]> = this.toastsSubject.asObservable();

  public show(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', title?: string, durationMs: number = 4500): string {
    const id = 'toast_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const toast: ToastMessage = {
      id,
      type,
      title,
      message,
      durationMs,
      timestamp: Date.now()
    };

    const current = this.toastsSubject.getValue();
    // Keep max 5 simultaneous toasts
    this.toastsSubject.next([...current.slice(-4), toast]);

    if (durationMs > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, durationMs);
    }

    return id;
  }

  public success(message: string, title: string = 'Success'): string {
    return this.show(message, 'success', title);
  }

  public error(message: string, title: string = 'Notice'): string {
    return this.show(message, 'error', title, 6000);
  }

  public warning(message: string, title: string = 'Warning'): string {
    return this.show(message, 'warning', title, 5000);
  }

  public info(message: string, title: string = 'Information'): string {
    return this.show(message, 'info', title);
  }

  public dismiss(id: string): void {
    const current = this.toastsSubject.getValue();
    this.toastsSubject.next(current.filter(t => t.id !== id));
  }

  public clear(): void {
    this.toastsSubject.next([]);
  }
}
