import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { DashboardManager } from './dashboard-manager';
import { AuthService } from '../../../core/services/auth.service';
import { CashierService } from '../../../core/services/cashier.service';
import { UserProfile } from '../../../core/models/auth.model';
import { CashierTransaction } from '../../../core/models/cashier-transaction.model';

describe('DashboardManager', () => {
  let component: DashboardManager;
  let fixture: ComponentFixture<DashboardManager>;

  const mockManagerUser: UserProfile = {
    id: 'manager-1',
    email: 'manager@transimex.cm',
    firstName: 'Paul',
    lastName: 'Ewane',
    role: 'manager',
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  const mockTransactions: CashierTransaction[] = [
    {
      id: 'tx-1',
      date: '2026-03-01',
      libelle: 'Approvisionnement caisse',
      typeTransaction: 'Espèces',
      typeDescription: 'Dotation',
      category: 'entree',
      firstName: 'Jean',
      quantity: 1,
      montant: 500000,
    },
    {
      id: 'tx-2',
      date: '2026-03-02',
      libelle: 'Carburant transport',
      typeTransaction: 'Gasoil',
      typeDescription: 'Camion 01',
      category: 'sortie',
      firstName: 'Paul',
      quantity: 1,
      montant: -50000,
    },
  ];

  const currentUserSignal = signal<UserProfile | null>(mockManagerUser);
  const transactionsSignal = signal<CashierTransaction[]>(mockTransactions);
  const balanceSignal = signal<number>(450000);

  const authServiceMock = {
    currentUser: currentUserSignal,
  };

  const cashierServiceMock = {
    allTransactions: transactionsSignal,
    currentBalance: balanceSignal,
    loadTransactions: jasmine.createSpy('loadTransactions').and.returnValue(Promise.resolve()),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardManager],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authServiceMock },
        { provide: CashierService, useValue: cashierServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardManager);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create dashboard manager component', () => {
    expect(component).toBeTruthy();
  });

  it('should format currency correctly in FCFA', () => {
    expect(component.formatCurrency(450000)).toContain('450');
    expect(component.formatCurrency(450000)).toContain('FCFA');
  });

  it('should compute chart points and paths correctly', () => {
    expect(component.chartPoints().length).toBe(2);
    expect(component.chartLinePath()).toContain('M');
    expect(component.chartAreaPath()).toContain('Z');
  });

  it('should handle chart mouse enter and leave events for tooltip', () => {
    const mockEvent = {
      currentTarget: {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 240 }),
      },
      clientX: 300,
      clientY: 100,
    } as unknown as MouseEvent;

    component.onChartMouseMove(mockEvent);
    expect(component.hoveredPoint()).not.toBeNull();

    component.onChartMouseLeave();
    expect(component.hoveredPoint()).toBeNull();
  });
});


