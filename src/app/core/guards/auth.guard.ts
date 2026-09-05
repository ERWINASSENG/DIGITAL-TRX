import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guard fonctionnel vérifiant que l'utilisateur est authentifié et actif.
 * Bloque et déconnecte les utilisateurs inactifs/désactivés, et redirige vers /auth/login.
 */
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const user = authService.currentUser();

  if (authService.isAuthenticated() && user && user.isActive) {
    return true;
  }

  // Si l'utilisateur est connecté mais désactivé
  if (authService.isAuthenticated() && user && !user.isActive) {
    authService.logout();
    return router.createUrlTree(['/auth/login'], {
      queryParams: { error: 'account_disabled' },
    });
  }

  // Stocker l'URL demandée pour redirection post-connexion éventuelle
  return router.createUrlTree(['/auth/login'], {
    queryParams: { returnUrl: state.url },
  });
};
