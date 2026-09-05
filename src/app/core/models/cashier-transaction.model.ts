/**
 * Modèle métier pour le module Caisse Transimex
 * Aligné avec l'interface et les colonnes : Check, Date, Libellé, Type de Transaction, First name, Employé, QTE, Montant, Soldes
 */

export type TransactionTypeCategory = 'entree' | 'sortie';

export interface CashierTransaction {
  id: string;
  date: string; // Format DD/MM/YYYY
  libelle: string; // Ex: "Carburant", "Depot initial"
  typeTransaction: string; // Titre principal du type
  typeDescription?: string; // Sous-texte descriptif
  category: TransactionTypeCategory; // entree (+) ou sortie (-)
  firstName: string; // Ex: "Nathan", "Jose"
  employee?: string; // Nom de l'employé associé
  quantity?: number; // Quantité (QTE)
  montant: number; // Valeur numérique signée (positif ou négatif)
  soldeApres?: number; // Solde cumulé calculé
  selected?: boolean; // Case à cocher de sélection
}

export interface CashierFilterState {
  searchQuery: string;
  categoryFilter: 'all' | 'entree' | 'sortie';
  pageIndex: number;
  pageSize: number;
}
