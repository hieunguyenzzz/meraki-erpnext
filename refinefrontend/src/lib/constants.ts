export interface ExpenseAccount {
  name: string;
  account_name: string;
}

// GL expense accounts (used by standalone Finance > Expenses page)
export const EXPENSE_ACCOUNTS: ExpenseAccount[] = [
  { name: "Office Expenses - MWP", account_name: "Office Expenses" },
  { name: "Marketing Expenses - MWP", account_name: "Marketing Expenses" },
  { name: "Travel Expenses - MWP", account_name: "Travel Expenses" },
  { name: "Software Expenses - MWP", account_name: "Software Expenses" },
  { name: "Miscellaneous Expenses - MWP", account_name: "Miscellaneous Expenses" },
  { name: "Administrative Expenses - MWP", account_name: "Administrative Expenses" },
  { name: "Entertainment Expenses - MWP", account_name: "Entertainment Expenses" },
  { name: "Equipment Expenses - MWP", account_name: "Equipment Expenses" },
  { name: "Utility Expenses - MWP", account_name: "Utility Expenses" },
  { name: "Telephone Expenses - MWP", account_name: "Telephone Expenses" },
];

// Wedding-specific expense categories (used by Expenses tab on wedding detail)
export const WEDDING_EXPENSE_CATEGORIES = [
  "Taxi",
  "Flight Ticket",
  "Hotel",
  "F&B",
  "Decoration",
  "Printing",
  "Tips / Gratuity",
  "Equipment Rental",
  "Gifts",
  "Other",
] as const;

export type WeddingExpenseCategory = typeof WEDDING_EXPENSE_CATEGORIES[number];
