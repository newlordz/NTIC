import { HttpInterceptorFn, HttpErrorResponse, HttpContextToken } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, retry, throwError, timer } from 'rxjs';
import { clearAllAuthValues, getAuthValue } from '../services/session.util';
import { NotificationService } from '../services/notification.service';

let lastSessionExpiredToastTime = 0;
let lastWriteFailureToastTime = 0;

/**
 * Set this on a request whose caller already reports failures itself, so the
 * global write-failure notice below does not produce a second toast.
 *
 *   this.http.post(url, body, { context: new HttpContext().set(HANDLES_OWN_WRITE_ERRORS, true) })
 */
export const HANDLES_OWN_WRITE_ERRORS = new HttpContextToken<boolean>(() => false);

const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Requests whose failure is genuinely not worth interrupting the user for.
 * Keep this list short and justified -- it is the same "discard the error"
 * habit that hid data loss for months, just centralised.
 */
const QUIET_ON_FAILURE = [
  '/api/logout',        // the local session is cleared regardless
  '/api/auth/verify',   // probed on load; failure is handled by the 401 path
  '/api/drafts',        // best-effort autosave, retried on the next keystroke
  '/api/chat',          // support widget, has its own inline state
];

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
        return throwError(() => err);
      }

      // A write that fails must never be invisible.
      //
      // Roughly forty call sites across the app subscribe with
      // `error: () => {}`. Each one meant an admin could edit hero slides,
      // events, schools, philosophy cards or talent records, see no error, and
      // have the change exist only in their own browser. Reporting it here
      // covers every one of those call sites at once, and cannot be undone by a
      // new silent subscriber, because interceptors run before the subscriber.
      //
      // GETs are deliberately excluded: falling back to cached data on a failed
      // background poll is legitimate and toasting it would be constant noise.
      const isWrite = WRITE_METHODS.includes(req.method);
      const isQuiet = QUIET_ON_FAILURE.some(p => req.url.includes(p));
      const callerReports = req.context.get(HANDLES_OWN_WRITE_ERRORS);

      if (isWrite && !isQuiet && !callerReports) {
        // Always log, even when the toast is throttled, so nothing is lost.
        console.error(`[http] ${req.method} ${req.url} failed:`, err.status, err.error?.detail || err.message);

        const now = Date.now();
        if (now - lastWriteFailureToastTime > 6000) {
          lastWriteFailureToastTime = now;
          const detail = err.error?.detail || '';
          if (err.status === 0) {
            notificationService.error(
              'Your change could not be saved because the server is unreachable. It has not been stored.',
              'Not saved'
            );
          } else if (err.status === 403) {
            notificationService.error(
              detail || 'Your account is not permitted to make that change, so it was not saved.',
              'Not saved'
            );
          } else {
            notificationService.error(
              detail
                ? `Your change was not saved: ${detail}`
                : `Your change was not saved (error ${err.status}).`,
              'Not saved'
            );
          }
        }
      }

      return throwError(() => err);
    })
  );
};
