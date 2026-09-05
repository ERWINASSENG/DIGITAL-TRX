import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CashierManagement } from './cashier-management';
import { CashierService } from '../../core/services/cashier.service';
import { SupabaseService } from '../../core/services/supabase.service';

describe('CashierManagement', () => {
  let component: CashierManagement;
  let fixture: ComponentFixture<CashierManagement>;
  let service: CashierService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CashierManagement],
      providers: [CashierService, SupabaseService],
    }).compileComponents();

    fixture = TestBed.createComponent(CashierManagement);
    component = fixture.componentInstance;
    service = TestBed.inject(CashierService);
    fixture.detectChanges();
  });

  it('devrait créer le composant', () => {
    expect(component).toBeTruthy();
  });

  it('devrait être initialisé avec une caisse vide par défaut', () => {
    expect(component.pagedTransactions().length).toBe(0);
    expect(component.currentBalance()).toBe(0);
    expect(component.paginationLabel()).toBe('00-00 / 00');
  });

  it('devrait ouvrir et fermer la modale de création', () => {
    expect(component.isModalOpen()).toBe(false);

    component.openNewModal();
    expect(component.isModalOpen()).toBe(true);

    component.closeModal();
    expect(component.isModalOpen()).toBe(false);
  });

  it('devrait formater correctement les montants monétaires en FCFA', () => {
    expect(component.formatCurrency(500000)).toContain('500 000 FCFA');
    expect(component.formatCurrency(-45000)).toContain('-45 000 FCFA');
    expect(component.formatSolde(455000)).toContain('455 000');
  });

  it('devrait soumettre une transaction valide de type Administration', async () => {
    component.openNewModal();
    component.transactionForm.patchValue({
      libelle: 'Fournitures de bureau',
      category: 'sortie',
      montant: 25000,
      typeTransaction: 'Administration',
    });

    await component.submitTransaction();

    expect(component.isModalOpen()).toBe(false);
    expect(service.allTransactions().length).toBe(1);
    expect(component.currentBalance()).toBe(-25000);
  });

  it('devrait exiger le matricule et la quantité lorsque le type est Opérations', async () => {
    component.openNewModal();
    component.transactionForm.patchValue({
      libelle: 'Carburant citerne',
      category: 'sortie',
      montant: 150000,
      typeTransaction: 'Opérations',
      matriculeVehicule: '',
      quantity: null,
    });

    expect(component.transactionForm.invalid).toBe(true);

    component.transactionForm.patchValue({
      matriculeVehicule: 'LT-842-AB',
      quantity: 50,
    });

    expect(component.transactionForm.valid).toBe(true);

    await component.submitTransaction();
    expect(component.isModalOpen()).toBe(false);
  });
});
