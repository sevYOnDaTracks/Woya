import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from './auth.store';
import { LoadingIndicatorService } from '../services/loading-indicator.service';
import { firebaseServices } from '../../app.config';

export const requireAuthGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  const loading = inject(LoadingIndicatorService);

  if (!auth.isInitialAuthResolved()) {
    loading.show();
    try {
      await auth.waitForInitialAuth();
    } finally {
      loading.hide();
    }
  }

  const user = auth.user$.value || firebaseServices.auth.currentUser;
  if (user) {
    if (auth.user$.value?.profileLoading) {
      loading.show();
      try {
        await auth.waitForProfileReady();
      } finally {
        loading.hide();
      }
    }
    if (auth.user$.value) {
      return true;
    }
  }

  const redirect = state?.url && state.url !== '/login' ? state.url : undefined;
  return router.createUrlTree(['/login'], {
    queryParams: redirect ? { redirect } : undefined,
  });
};
