import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { CashierService } from '../../core/services/cashier.service';
import { AuthService } from '../../core/services/auth.service';
import {
  CashierTransaction,
  TransactionTypeCategory,
} from '../../core/models/cashier-transaction.model';

@Component({
  selector: 'app-cashier-management',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, RouterLink],
  templateUrl: './cashier-management.html',
  styleUrl: './cashier-management.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CashierManagement implements OnInit {
  private readonly cashierService = inject(CashierService);
  private readonly authService = inject(AuthService);

  // Permissions : Seuls admin et caissiere peuvent créer/modifier/supprimer
  public readonly canEdit = computed(() => {
    const role = this.authService.currentUser()?.role;
    return role === 'admin' || role === 'caissiere';
  });

  // Visibilité du bouton Tableau de bord : réservé à manager et admin
  public readonly canViewDashboardButton = computed(() => {
    const role = this.authService.currentUser()?.role;
    return role === 'manager' || role === 'admin';
  });

  // Données réactives issues du service
  public readonly pagedTransactions = this.cashierService.pagedTransactions;
  public readonly currentBalance = this.cashierService.currentBalance;
  public readonly totalCount = this.cashierService.totalCount;
  public readonly filterState = this.cashierService.filterState;
  public readonly isAllSelected = this.cashierService.isAllSelected;
  public readonly isLoading = this.cashierService.isLoading;
  public readonly error = this.cashierService.error;

  // Contrôles UI
  public readonly isAddingRow = signal<boolean>(false);
  public readonly isSubmitting = signal<boolean>(false);
  public readonly isDeleting = signal<boolean>(false);
  public readonly isFilterDropdownOpen = signal<boolean>(false);
  public readonly searchControl = new FormControl<string>('', {
    nonNullable: true,
  });

  // Nombre d'éléments sélectionnés
  public readonly selectedCount = computed(() => {
    return this.cashierService.allTransactions().filter((t) => t.selected).length;
  });

  // Pagination au format exact : "01-02 / 02" ou "00-00 / 00"
  public readonly paginationLabel = computed(() => {
    const total = this.totalCount();
    if (total === 0) return '00-00 / 00';
    const { pageIndex, pageSize } = this.filterState();
    const start = pageIndex * pageSize + 1;
    const end = Math.min((pageIndex + 1) * pageSize, total);

    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${pad(start)}-${pad(end)} / ${pad(total)}`;
  });

  public readonly canPrevPage = computed(() => this.filterState().pageIndex > 0);
  public readonly canNextPage = computed(() => {
    const { pageIndex, pageSize } = this.filterState();
    return (pageIndex + 1) * pageSize < this.totalCount();
  });

  // Formulaire de transaction réactif
  public readonly transactionForm = new FormGroup({
    date: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    libelle: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    typeTransaction: new FormControl<'Opérations' | 'Administration'>('Administration', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    typeDescription: new FormControl<string>('', { nonNullable: true }),
    category: new FormControl<TransactionTypeCategory>('sortie', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    matriculeVehicule: new FormControl<string>('', { nonNullable: true }),
    employee: new FormControl<string>('', { nonNullable: true }),
    quantity: new FormControl<number | null>(null),
    montant: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(1)],
    }),
  });

  public readonly isOperationsType = signal<boolean>(false);

  constructor() {
    this.searchControl.valueChanges.subscribe((val) => {
      this.cashierService.setSearchQuery(val);
    });

    // Écoute dynamique du type de transaction pour activer la distribution analytique
    this.transactionForm.get('typeTransaction')?.valueChanges.subscribe((type) => {
      const isOps = type === 'Opérations';
      this.isOperationsType.set(isOps);
      this.updateConditionalValidators(isOps);
    });
  }

  private updateConditionalValidators(isOps: boolean): void {
    const matriculeCtrl = this.transactionForm.get('matriculeVehicule');
    const quantityCtrl = this.transactionForm.get('quantity');

    if (isOps) {
      matriculeCtrl?.setValidators([Validators.required, Validators.minLength(2)]);
      quantityCtrl?.setValidators([Validators.required, Validators.min(1)]);
    } else {
      matriculeCtrl?.clearValidators();
      quantityCtrl?.clearValidators();
    }
    matriculeCtrl?.updateValueAndValidity();
    quantityCtrl?.updateValueAndValidity();
  }

  public readonly todayFormatted = signal<string>('');
  public readonly todayIsoDate = signal<string>('');

  public ngOnInit(): void {
    this.cashierService.loadTransactions();
    const today = new Date();
    const isoDate = today.toISOString().split('T')[0];
    this.todayIsoDate.set(isoDate);

    this.todayFormatted.set(
      `${String(today.getDate()).padStart(2, '0')}/${String(
        today.getMonth() + 1
      ).padStart(2, '0')}/${today.getFullYear()}`
    );
  }

  public refresh(): void {
    this.cashierService.loadTransactions();
  }

  public formatCurrency(amount: number): string {
    const formatted = Math.abs(amount)
      .toLocaleString('fr-FR')
      .replace(/\u202F/g, ' ');
    if (amount < 0) {
      return `-${formatted} FCFA`;
    }
    return `${formatted} FCFA`;
  }

  public formatSolde(amount: number): string {
    return amount.toLocaleString('fr-FR').replace(/\u202F/g, ' ');
  }

  public onToggleSelect(tx: CashierTransaction): void {
    this.cashierService.toggleSelectTransaction(tx.id);
  }

  public onToggleSelectAll(): void {
    const nextState = !this.isAllSelected();
    this.cashierService.toggleSelectAll(nextState);
  }

  public async deleteSelectedTransactions(): Promise<void> {
    if (this.selectedCount() === 0) return;
    this.isDeleting.set(true);
    await this.cashierService.deleteSelected();
    this.isDeleting.set(false);
  }

  public prevPage(): void {
    if (this.canPrevPage()) {
      this.cashierService.setPageIndex(this.filterState().pageIndex - 1);
    }
  }

  public nextPage(): void {
    if (this.canNextPage()) {
      this.cashierService.setPageIndex(this.filterState().pageIndex + 1);
    }
  }

  /**
   * Ouvre la ligne d'édition horizontale dans le tableau
   */
  public startAddInline(): void {
    const today = new Date();
    const isoDate = today.toISOString().split('T')[0];
    this.transactionForm.reset({
      date: isoDate,
      libelle: '',
      typeTransaction: 'Administration',
      typeDescription: '',
      category: 'sortie',
      matriculeVehicule: '',
      employee: '',
      quantity: null,
      montant: null,
    });
    this.isOperationsType.set(false);
    this.updateConditionalValidators(false);
    this.isAddingRow.set(true);
  }

  public cancelAddInline(): void {
    this.isAddingRow.set(false);
  }

  public toggleFilterDropdown(): void {
    this.isFilterDropdownOpen.update((v) => !v);
  }

  public applyCategoryFilter(cat: 'all' | 'entree' | 'sortie'): void {
    this.cashierService.setCategoryFilter(cat);
    this.isFilterDropdownOpen.set(false);
  }

  public async submitInlineTransaction(): Promise<void> {
    if (this.transactionForm.invalid) {
      this.transactionForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    const formValues = this.transactionForm.getRawValue();
    const rawMontant = Number(formValues.montant) || 0;
    const finalMontant =
      formValues.category === 'sortie' ? -Math.abs(rawMontant) : Math.abs(rawMontant);

    // Formate la date sélectionnée (ex: '2026-09-05' -> '05/09/2026')
    let formattedDate = this.todayFormatted();
    if (formValues.date) {
      const parts = formValues.date.split('-');
      if (parts.length === 3) {
        formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
      } else {
        formattedDate = formValues.date;
      }
    }

    const success = await this.cashierService.addTransaction({
      date: formattedDate,
      libelle: formValues.libelle,
      typeTransaction: formValues.typeTransaction,
      typeDescription: formValues.typeDescription || undefined,
      category: formValues.category,
      matriculeVehicule: formValues.matriculeVehicule || undefined,
      employee: formValues.employee || undefined,
      quantity: formValues.quantity !== null && formValues.quantity !== undefined ? Number(formValues.quantity) : undefined,
      montant: finalMontant,
    });

    this.isSubmitting.set(false);
    if (success) {
      this.cancelAddInline();
    }
  }

  public trackByTxId(_index: number, tx: CashierTransaction): string {
    return tx.id;
  }
}

// Alias pour compatibilité
export { CashierManagement as CashierManagementComponent };
