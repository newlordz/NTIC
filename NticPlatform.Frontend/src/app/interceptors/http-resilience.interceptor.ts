import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, retry, throwError, timer } from 'rxjs';
import { clearAllAuthValues, getAuthValue } from '../services/session.util';
import { NotificationService } from '../services/notification.service';

let lastSessionExpiredToastTime = 0;

export const httpResilienceInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const notificationService = inject(NotificationService);

  const token = getAuthValue('activeUserToken');
  if (token) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    });
  }

  return next(req).pipe(
    // Retry idempotent GET requests on transient network issues
    retry({
      count: req.method === 'GET' ? 1 : 0,
      delay: (error: HttpErrorResponse, retryCount: number) => {
        if (error.status === 0 || error.status === 503 || error.status === 504) {
          return timer(retryCount * 1200);
        }
        return throwError(() => error);
      }
    }),
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && !req.url.includes('/api/login')) {
        // Only trigger session expiration if there was an active token sent
        if (token) {
          clearAllAuthValues();
          const now = Date.now();
          if (now - lastSessionExpiredToastTime > 15000) {
            lastSessionExpiredToastTime = now;
            notificationService.warning('Session expired. Please sign in to continue.');
          }
          const currentPath = (router.url || '').split('?')[0].split('#')[0];
          if (currentPath !== '/' && currentPath !== '/landing' && currentPath !== '') {
            router.navigate(['/']);
          }
        }
      }
      return throwError(() => err);
    })
  );
};
