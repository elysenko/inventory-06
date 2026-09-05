import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { readRaw, removeKeys } from './storage';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const token = readRaw('token');
  const authed = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authed).pipe(
    catchError((err: unknown) => {
      const status = (err as { status?: number } | null)?.status;
      if (status === 401) {
        removeKeys('user', 'token');
        void router.navigate(['/login']);
      }
      return throwError(() => err);
    }),
  );
};
