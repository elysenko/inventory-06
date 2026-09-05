import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

/**
 * Manager-tier routes. Clerks are sent to /items, which is guarded only by
 * authGuard and therefore cannot bounce back — the redirect is provably
 * single-hop.
 */
export const managerGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], {
      queryParams: { redirect: state.url },
    });
  }
  return auth.isManager() ? true : router.createUrlTree(['/items']);
};
