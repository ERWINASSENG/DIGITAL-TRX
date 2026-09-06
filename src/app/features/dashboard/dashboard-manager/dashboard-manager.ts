import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth.service';
import { CashierService } from '../../../core/services/cashier.service';

export interface ChartPoint {
  x: number;
  y: number;
  pixelY: number;
  percentX: number;
  balance: number;
  date: string;
  label?: string;
}

@Component({
  selector: 'app-dashboard-manager',
  imports: [RouterLink, MatIconModule],
  templateUrl: './dashboard-manager.html',
  styleUrl: './dashboard-manager.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardManager implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly cashierService = inject(CashierService);

  public readonly currentUser = this.authService.currentUser;
  public readonly allTransactions = this.cashierService.allTransactions;
  public readonly currentBalance = this.cashierService.currentBalance;

  // Point actif au survol pour le tooltip
  public readonly hoveredPoint = signal<ChartPoint | null>(null);

  // Calcul des points de la courbe du solde
  public readonly chartPoints = computed<ChartPoint[]>(() => {
    const list = [...this.allTransactions()].sort((a, b) => {
      const dateA = new Date(a.date).getTime() || 0;
      const dateB = new Date(b.date).getTime() || 0;
      return dateA - dateB;
    });

    if (list.length === 0) {
      // Données de base propre si aucune transaction encore enregistrée
      return [
        {
          x: 30,
          y: 180,
          pixelY: 180,
          percentX: 5,
          balance: 0,
          date: 'Début de période',
          label: 'Solde initial',
        },
        {
          x: 570,
          y: 180,
          pixelY: 180,
          percentX: 95,
          balance: 0,
          date: 'Aujourd’hui',
          label: 'Solde actuel',
        },
      ];
    }

    // Calcul du solde cumulé
    let cumulative = 0;
    const history = list.map((tx) => {
      cumulative += tx.montant;
      return {
        balance: cumulative,
        date: tx.date || new Date().toLocaleDateString('fr-FR'),
        label: tx.libelle,
      };
    });

    const balances = history.map((h) => h.balance);
    const minBalance = Math.min(...balances, 0);
    const maxBalance = Math.max(...balances, 1000);
    const range = maxBalance - minBalance || 1;

    const width = 540; // de 30 à 570
    const height = 160; // de 40 à 200

    return history.map((h, index) => {
      const x =
        history.length === 1
          ? 300
          : 30 + (index / (history.length - 1)) * width;
      const normalizedY = (h.balance - minBalance) / range;
      const y = 200 - normalizedY * height;

      return {
        x: Math.round(x),
        y: Math.round(y),
        pixelY: Math.round(y),
        percentX: Math.round((x / 600) * 100),
        balance: h.balance,
        date: h.date,
        label: h.label,
      };
    });
  });

  // Tracé de la ligne SVG
  public readonly chartLinePath = computed<string>(() => {
    const pts = this.chartPoints();
    if (pts.length === 0) return '';
    return pts.reduce((acc, pt, i) => {
      if (i === 0) return `M ${pt.x} ${pt.y}`;
      return `${acc} L ${pt.x} ${pt.y}`;
    }, '');
  });

  // Tracé de la surface dégradée SVG
  public readonly chartAreaPath = computed<string>(() => {
    const pts = this.chartPoints();
    if (pts.length === 0) return '';
    const first = pts[0];
    const last = pts[pts.length - 1];
    const line = pts.reduce((acc, pt, i) => {
      if (i === 0) return `M ${pt.x} ${pt.y}`;
      return `${acc} L ${pt.x} ${pt.y}`;
    }, '');
    return `${line} L ${last.x} 230 L ${first.x} 230 Z`;
  });

  public ngOnInit(): void {
    // Charge les transactions de caisse au chargement du dashboard manager
    void this.cashierService.loadTransactions();
  }

  // Formatage monétaire en FCFA
  public formatCurrency(amount: number): string {
    const formatted = new Intl.NumberFormat('fr-FR', {
      maximumFractionDigits: 0,
    }).format(amount);
    return `${formatted} FCFA`;
  }

  // Gestion du survol de la souris sur le graphique SVG
  public onChartMouseMove(event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const ratioX = mouseX / rect.width;
    const svgX = ratioX * 600;

    const points = this.chartPoints();
    if (points.length === 0) return;

    // Trouve le point le plus proche de la position X de la souris
    let closest = points[0];
    let minDiff = Math.abs(closest.x - svgX);

    for (let i = 1; i < points.length; i++) {
      const diff = Math.abs(points[i].x - svgX);
      if (diff < minDiff) {
        minDiff = diff;
        closest = points[i];
      }
    }

    // Calcul de la position pixel Y relative au conteneur
    const pixelY = (closest.y / 240) * rect.height;

    this.hoveredPoint.set({
      ...closest,
      pixelY,
      percentX: (closest.x / 600) * 100,
    });
  }

  public onChartMouseLeave(): void {
    this.hoveredPoint.set(null);
  }
}


