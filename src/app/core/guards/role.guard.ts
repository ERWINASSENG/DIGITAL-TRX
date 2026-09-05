import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserRole } from '../models/auth.model';
import { AuthService } from '../services/auth.service';

/**
 * Guard fonctionnel vérifiant que l'utilisateur possède l'un des rôles requis
 * définis dans le data de la route (ex: data: { roles: ['admin', 'rh'] }).
 * Redirige vers /dashboard en cas de permission insuffisante.
 */
export const roleGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const requiredRoles = (route.data?.['roles'] as UserRole[]) || [];

  // Si aucun rôle spécifique n'est exigé, accès autorisé
  if (requiredRoles.length === 0) {
    return true;
  }

  // Vérifier si l'utilisateur possède l'un des rôles requis
  if (authService.hasRole(requiredRoles)) {
    return true;
  }

  // Redirection vers le dashboard principal en cas de refus d'accès
  return router.createUrlTree(['/dashboard'], {
    queryParams: { unauthorized: '1' },
  });
};
