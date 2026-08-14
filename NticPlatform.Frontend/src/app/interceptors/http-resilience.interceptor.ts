import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, retry, throwError, timer } from 'rxjs';
import { clearAllAuthValues, getAuthValue } from '../services/session.util';
import { NotificationService } from '../services/notification.service';

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
        notificationService.warning('Session expired. Please sign in to continue.');
        clearAllAuthValues();
        router.navigate(['/']);
      }
      return throwError(() => err);
    })
  );
};
