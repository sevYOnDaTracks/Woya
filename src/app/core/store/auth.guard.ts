import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firebaseServices } from '../../app.config';
import { AuthStore } from './auth.store';

export const requireAuthGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  const user = auth.user$.value || firebaseServices.auth.currentUser;
  if (user) {
    return true;
  }

  const redirect = state?.url && state.url !== '/login' ? state.url : undefined;
  return router.createUrlTree(['/login'], {
    queryParams: redirect ? { redirect } : undefined,
  });
};
