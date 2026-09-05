import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth.service';

export interface ManagerApprovalRequest {
  id: string;
  type: 'caisse' | 'conge' | 'logistique';
  title: string;
  initiator: string;
  detail: string;
  date: string;
  icon: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface ManagerAlert {
  id: string;
  severity: 'warning' | 'info';
  title: string;
  message: string;
  icon: string;
}

@Component({
  selector: 'app-dashboard-manager',
  imports: [RouterLink, MatIconModule],
  templateUrl: './dashboard-manager.html',
  styleUrl: './dashboard-manager.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardManager {
  private readonly authService = inject(AuthService);

  public readonly currentUser = this.authService.currentUser;

  public readonly teamPresentCount = signal(0);
  public readonly teamTotalCount = signal(0);

  public readonly pendingRequests = signal<ManagerApprovalRequest[]>([]);

  public readonly pendingCount = computed(() => {
    return this.pendingRequests().filter((r) => r.status === 'pending').length;
  });

  public readonly alerts = signal<ManagerAlert[]>([]);

  public approveRequest(id: string): void {
    this.pendingRequests.update((reqs) =>
      reqs.map((r) => (r.id === id ? { ...r, status: 'approved' } : r))
    );
  }

  public rejectRequest(id: string): void {
    this.pendingRequests.update((reqs) =>
      reqs.map((r) => (r.id === id ? { ...r, status: 'rejected' } : r))
    );
  }
}
