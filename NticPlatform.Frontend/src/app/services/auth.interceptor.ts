import { HttpInterceptorFn } from '@angular/common/http';
import { getAuthValue } from './session.util';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = getAuthValue('activeUserToken');
  if (token) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    });
  }
  return next(req);
};
