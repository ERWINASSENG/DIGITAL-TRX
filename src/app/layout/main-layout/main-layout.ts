import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ROLE_DEFINITIONS, UserRole } from '../../core/models/auth.model';
import { AuthService } from '../../core/services/auth.service';

export interface SidebarNavOption {
  id: string;
  label: string;
  route: string;
  icon: string;
  allowedRoles: UserRole[];
}

@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainLayout {
  private readonly authService = inject(AuthService);

  public readonly currentUser = this.authService.currentUser;
  public readonly isSidebarOpen = signal<boolean>(false);

  // Menu de navigation principal Transimex avec contrôle d'accès RBAC
  private readonly allMenuItems: SidebarNavOption[] = [
    {
      id: 'nav-dashboard',
      label: 'Tableau de bord',
      route: '/dashboard',
      icon: 'grid_view',
      allowedRoles: ['admin', 'rh', 'manager_stock', 'caissier', 'agent'],
    },
    {
      id: 'nav-hr',
      label: 'Ressources humaines',
      route: '/hr',
      icon: 'group',
      allowedRoles: ['admin', 'rh'],
    },
    {
      id: 'nav-cashier',
      label: 'Caisse',
      route: '/caisse',
      icon: 'account_balance_wallet',
      allowedRoles: ['admin', 'caissier'],
    },
    {
      id: 'nav-users',
      label: 'Utilisateurs & Rôles',
      route: '/admin/users',
      icon: 'manage_accounts',
      allowedRoles: ['admin'],
    },
  ];

  // Filtrage dynamique selon le rôle de l'utilisateur connecté
  public readonly visibleMenuItems = computed<SidebarNavOption[]>(() => {
    const user = this.currentUser();
    if (!user) return [];
    if (user.role === 'admin') return this.allMenuItems;
    return this.allMenuItems.filter((item) => item.allowedRoles.includes(user.role));
  });

  public roleLabel(role?: UserRole): string {
    if (!role) return 'Utilisateur';
    return ROLE_DEFINITIONS[role]?.label || role;
  }

  public toggleSidebar(): void {
    this.isSidebarOpen.update((v) => !v);
  }

  public closeSidebar(): void {
    this.isSidebarOpen.set(false);
  }

  public async logout(): Promise<void> {
    await this.authService.logout();
  }
}
