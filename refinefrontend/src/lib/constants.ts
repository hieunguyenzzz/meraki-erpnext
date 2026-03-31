// This file previously held hardcoded expense accounts and wedding expense categories.
// Those are now fetched dynamically from /inquiry-api/expense/categories.
// Kept for backwards compatibility in case any imports remain.

export interface ExpenseAccount {
  name: string;
  account_name: string;
}
