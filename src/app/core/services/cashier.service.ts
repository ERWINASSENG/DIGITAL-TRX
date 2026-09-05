import { Injectable, computed, inject, signal } from '@angular/core';
import {
  CashierFilterState,
  CashierTransaction,
} from '../models/cashier-transaction.model';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

export interface CashierDbRow {
  id: string;
  date: string;
  libelle: string;
  type_transaction: string;
  type_description: string | null;
  category: 'entree' | 'sortie' | null;
  matricule_vehicule?: string | null;
  first_name: string | null;
  employee: string | null;
  quantity: number | null;
  montant: number;
  created_by?: string | null;
  created_at?: string;
}

@Injectable({
  providedIn: 'root',
})
export class CashierService {
  private readonly supabaseService = inject(SupabaseService);
  private readonly authService = inject(AuthService);

  // Liste des transactions en signal (initialement vide, alimentée depuis Supabase)
  private readonly _transactions = signal<CashierTransaction[]>([]);
  private readonly _isLoading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);

  // Filtres et pagination
  private readonly _filterState = signal<CashierFilterState>({
    searchQuery: '',
    categoryFilter: 'all',
    pageIndex: 0,
    pageSize: 10,
  });

  // États exposés
  public readonly isLoading = computed(() => this._isLoading());
  public readonly error = computed(() => this._error());
  public readonly allTransactions = computed(() => this._transactions());

  // Transactions filtrées par mot-clé et type
  public readonly filteredTransactions = computed(() => {
    const query = this._filterState().searchQuery.trim().toLowerCase();
    const category = this._filterState().categoryFilter;
    const list = this._transactions();

    return list.filter((tx) => {
      const matchesCategory =
        category === 'all' || tx.category === category;
      if (!matchesCategory) return false;

      if (!query) return true;

      const searchableText = `${tx.libelle} ${tx.typeTransaction} ${tx.typeDescription || ''} ${tx.firstName} ${tx.employee || ''}`.toLowerCase();
      return searchableText.includes(query);
    });
  });

  // Calcul du solde actuel en temps réel
  public readonly currentBalance = computed(() => {
    const list = this._transactions();
    if (list.length === 0) return 0;
    return list.reduce((acc, curr) => acc + curr.montant, 0);
  });

  // Transactions paginées
  public readonly pagedTransactions = computed(() => {
    const filtered = this.filteredTransactions();
    const { pageIndex, pageSize } = this._filterState();
    const start = pageIndex * pageSize;
    return filtered.slice(start, start + pageSize);
  });

  // Total des éléments filtrés
  public readonly totalCount = computed(() => this.filteredTransactions().length);

  // État du filtre actuel en lecture seule
  public readonly filterState = computed(() => this._filterState());

  // Indique si toutes les transactions affichées sont sélectionnées
  public readonly isAllSelected = computed(() => {
    const currentList = this.pagedTransactions();
    return currentList.length > 0 && currentList.every((tx) => !!tx.selected);
  });

  /**
   * Charge toutes les transactions réelles depuis la base de données Supabase
   */
  public async loadTransactions(): Promise<void> {
    const client = this.supabaseService.supabase;
    if (!client) {
      this._transactions.set([]);
      return;
    }

    this._isLoading.set(true);
    this._error.set(null);

    try {
      const { data, error } = await client
        .from('cashier_transactions')
        .select('*')
        .order('date', { ascending: false });

      if (error) {
        throw error;
      }

      if (data && Array.isArray(data)) {
        // Calculer les soldes progressifs
        let runningBalance = 0;
        const chronological = [...(data as CashierDbRow[])].reverse();
        const mappedChronological = chronological.map((row) => {
          const numMontant = Number(row.montant) || 0;
          runningBalance += numMontant;
          return {
            id: row.id,
            date: this.formatDate(row.date),
            libelle: row.libelle || '',
            typeTransaction: row.type_transaction || '',
            typeDescription: row.type_description || '',
            category: (row.category || (numMontant >= 0 ? 'entree' : 'sortie')) as 'entree' | 'sortie',
            matriculeVehicule: row.matricule_vehicule || '',
            firstName: row.first_name || '',
            employee: row.employee || '',
            quantity: row.quantity !== null && row.quantity !== undefined ? Number(row.quantity) : undefined,
            montant: numMontant,
            soldeApres: runningBalance,
            selected: false,
          } as CashierTransaction;
        });

        const sortedTransactions = mappedChronological.reverse();
        this._transactions.set(sortedTransactions);
      } else {
        this._transactions.set([]);
      }
    } catch (err: unknown) {
      const pgErr = err as { message?: string; details?: string; hint?: string; code?: string };
      const message = pgErr?.message || (err instanceof Error ? err.message : 'Erreur lors du chargement des transactions.');
      this._error.set(message);
    } finally {
      this._isLoading.set(false);
    }
  }

  public setSearchQuery(query: string): void {
    this._filterState.update((state) => ({
      ...state,
      searchQuery: query,
      pageIndex: 0,
    }));
  }

  public setCategoryFilter(category: 'all' | 'entree' | 'sortie'): void {
    this._filterState.update((state) => ({
      ...state,
      categoryFilter: category,
      pageIndex: 0,
    }));
  }

  public setPageIndex(index: number): void {
    this._filterState.update((state) => ({
      ...state,
      pageIndex: Math.max(0, index),
    }));
  }

  public toggleSelectTransaction(id: string): void {
    this._transactions.update((items) =>
      items.map((item) =>
        item.id === id ? { ...item, selected: !item.selected } : item
      )
    );
  }

  public toggleSelectAll(select: boolean): void {
    const displayedIds = new Set(this.pagedTransactions().map((t) => t.id));
    this._transactions.update((items) =>
      items.map((item) =>
        displayedIds.has(item.id) ? { ...item, selected: select } : item
      )
    );
  }

  /**
   * Enregistre une transaction dans Supabase et met à jour l'état
   */
  public async addTransaction(
    newTx: Omit<CashierTransaction, 'id' | 'soldeApres' | 'selected'>
  ): Promise<boolean> {
    const client = this.supabaseService.supabase;
    const currentSolde = this.currentBalance();
    const newSolde = currentSolde + newTx.montant;

    if (!client) {
      const fallbackTx: CashierTransaction = {
        ...newTx,
        id: `tx-${Date.now()}`,
        soldeApres: newSolde,
        selected: false,
      };
      this._transactions.update((items) => [fallbackTx, ...items]);
      return true;
    }

    try {
      this._error.set(null);
      const currentUser = this.authService.currentUser();
      
      const dbRow = {
        libelle: newTx.libelle,
        type_transaction: newTx.typeTransaction,
        type_description: newTx.typeDescription || null,
        category: newTx.category,
        matricule_vehicule: newTx.matriculeVehicule || null,
        first_name: newTx.firstName || null,
        employee: newTx.employee || null,
        quantity: newTx.quantity || 1,
        montant: newTx.montant,
        created_by: currentUser?.id || null,
      };

      const { data, error } = await client
        .from('cashier_transactions')
        .insert([dbRow])
        .select()
        .single();

      if (error) {
        throw error;
      }

      if (data) {
        const created: CashierTransaction = {
          id: data.id,
          date: this.formatDate(data.date || new Date().toISOString()),
          libelle: data.libelle,
          typeTransaction: data.type_transaction,
          typeDescription: data.type_description || '',
          category: data.category,
          matriculeVehicule: data.matricule_vehicule || '',
          firstName: data.first_name || '',
          employee: data.employee || '',
          quantity: data.quantity ? Number(data.quantity) : undefined,
          montant: Number(data.montant),
          soldeApres: newSolde,
          selected: false,
        };
        this._transactions.update((items) => [created, ...items]);
      }
      return true;
    } catch (err: unknown) {
      const pgErr = err as { message?: string; details?: string; hint?: string; code?: string };
      const errorMsg = pgErr?.message 
        ? `${pgErr.message}${pgErr.details ? ` (${pgErr.details})` : ''}`
        : (err instanceof Error ? err.message : "Erreur lors de l'enregistrement de la transaction.");
      
      this._error.set(errorMsg);
      return false;
    }
  }

  /**
   * Supprime les transactions sélectionnées dans Supabase et dans l'état local
   */
  public async deleteSelected(): Promise<boolean> {
    const selectedIds = this._transactions()
      .filter((t) => t.selected)
      .map((t) => t.id);

    if (selectedIds.length === 0) return true;

    const client = this.supabaseService.supabase;
    if (!client) {
      this._transactions.update((items) => items.filter((item) => !item.selected));
      return true;
    }

    try {
      this._error.set(null);
      const { error } = await client
        .from('cashier_transactions')
        .delete()
        .in('id', selectedIds);

      if (error) throw error;

      this._transactions.update((items) => items.filter((item) => !item.selected));
      return true;
    } catch (err: unknown) {
      const pgErr = err as { message?: string; details?: string; hint?: string; code?: string };
      const message = pgErr?.message || (err instanceof Error ? err.message : 'Erreur lors de la suppression des transactions.');
      this._error.set(message);
      return false;
    }
  }

  private formatDate(dateStr: string): string {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  }
}
