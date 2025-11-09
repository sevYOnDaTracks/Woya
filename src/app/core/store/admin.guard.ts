import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAuthService } from './admin-auth.service';

export const requireAdminGuard: CanActivateFn = (_route, state) => {
  const adminAuth = inject(AdminAuthService);
  const router = inject(Router);

  if (adminAuth.isAuthenticated()) {
    return true;
  }

  const redirect = state?.url && state.url !== '/admin' ? state.url : undefined;
  return router.createUrlTree(['/admin'], {
    queryParams: redirect ? { redirect } : undefined,
  });
};
