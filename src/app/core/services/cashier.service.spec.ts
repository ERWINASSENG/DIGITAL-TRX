import { TestBed } from '@angular/core/testing';
import { CashierService } from './cashier.service';
import { SupabaseService } from './supabase.service';

describe('CashierService', () => {
  let service: CashierService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CashierService, SupabaseService],
    });
    service = TestBed.inject(CashierService);
  });

  it('devrait être initialisé avec une liste vide (sans mocks)', () => {
    expect(service).toBeTruthy();
    expect(service.allTransactions().length).toBe(0);
    expect(service.currentBalance()).toBe(0);
  });

  it('devrait ajouter une nouvelle opération et recalculer le solde actuel', async () => {
    const res = await service.addTransaction({
      date: '05/09/2026',
      libelle: 'Fournitures bureau',
      typeTransaction: 'Achat consommables',
      category: 'sortie',
      firstName: 'Alain',
      montant: -15000,
    });

    expect(res).toBe(true);
    expect(service.allTransactions().length).toBe(1);
    expect(service.currentBalance()).toBe(-15000);
    expect(service.allTransactions()[0].libelle).toBe('Fournitures bureau');
  });

  it('devrait filtrer les transactions par recherche texte', async () => {
    await service.addTransaction({
      date: '05/09/2026',
      libelle: 'Carburant',
      typeTransaction: 'Transport',
      category: 'sortie',
      firstName: 'Jean',
      montant: -45000,
    });

    service.setSearchQuery('Carburant');
    expect(service.filteredTransactions().length).toBe(1);
    expect(service.filteredTransactions()[0].libelle).toBe('Carburant');

    service.setSearchQuery('introuvable-xyz');
    expect(service.filteredTransactions().length).toBe(0);

    service.setSearchQuery('');
    expect(service.filteredTransactions().length).toBe(1);
  });

  it('devrait sélectionner et supprimer des transactions', async () => {
    await service.addTransaction({
      date: '05/09/2026',
      libelle: 'Versement caisse',
      typeTransaction: 'Apport',
      category: 'entree',
      firstName: 'Admin',
      montant: 200000,
    });

    const tx = service.allTransactions()[0];
    service.toggleSelectTransaction(tx.id);
    expect(service.allTransactions().find((t) => t.id === tx.id)?.selected).toBe(true);

    await service.deleteSelected();
    expect(service.allTransactions().length).toBe(0);
  });
});
