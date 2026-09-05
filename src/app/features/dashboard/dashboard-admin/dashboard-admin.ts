import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-dashboard-admin',
  imports: [],
  templateUrl: './dashboard-admin.html',
  styleUrl: './dashboard-admin.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardAdmin {
  private readonly authService = inject(AuthService);
  public readonly currentUser = this.authService.currentUser;
}
