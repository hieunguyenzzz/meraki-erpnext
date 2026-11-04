export interface Project {
  name: string;
  project_name: string;
  expected_end_date: string | null;
}

export interface ExpenseRow {
  name: string;
  posting_date: string;
  description: string;
  amount: number;
  category: string;
  category_label: string;
  status: "Approved" | "Pending" | "Rejected";
  staff: string;
  staff_name: string;
  supplier_name: string;
  receipt_url: string | null;
  project: string;
  project_name: string;
}

/** total / count leave out rejected expenses, the same rule as the wedding page's Expenses card. */
export interface ExpenseSummary {
  total: number;
  approved: number;
  pending: number;
  count: number;
  counted: number;
}

export interface ExpenseCategory {
  label: string;
  amount: number;
}

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive"> = {
  Approved: "success",
  Pending: "warning",
  Rejected: "destructive",
};
