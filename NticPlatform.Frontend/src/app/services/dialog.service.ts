import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface ConfirmDialogData {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

export interface ToastData {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

@Injectable({
  providedIn: 'root'
})
export class DialogService {
  private confirmSubject = new BehaviorSubject<{ data: ConfirmDialogData; resolve: (result: boolean) => void } | null>(null);
  public confirmState$ = this.confirmSubject.asObservable();

  private toastsSubject = new BehaviorSubject<ToastData[]>([]);
  public toasts$ = this.toastsSubject.asObservable();

  confirm(options: string | ConfirmDialogData): Promise<boolean> {
    return new Promise((resolve) => {
      const data: ConfirmDialogData = typeof options === 'string'
        ? { message: options }
        : options;

      this.confirmSubject.next({
        data: {
          title: data.title || 'Confirm Action',
          message: data.message,
          confirmText: data.confirmText || 'Confirm',
          cancelText: data.cancelText || 'Cancel',
          type: data.type || 'danger'
        },
        resolve: (result: boolean) => {
          this.confirmSubject.next(null);
          resolve(result);
        }
      });
    });
  }

  toast(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', duration: number = 4000): void {
    const id = 'toast-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    const newToast: ToastData = { id, message, type, duration };
    const current = this.toastsSubject.value;
    this.toastsSubject.next([...current, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        this.removeToast(id);
      }, duration);
    }
  }

  removeToast(id: string): void {
    const current = this.toastsSubject.value.filter(t => t.id !== id);
    this.toastsSubject.next(current);
  }

  closeConfirm(result: boolean): void {
    const current = this.confirmSubject.value;
    if (current) {
      current.resolve(result);
    }
  }
}
