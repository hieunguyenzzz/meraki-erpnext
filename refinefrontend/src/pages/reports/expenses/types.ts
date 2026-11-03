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
}

export interface ExpenseSummary {
  total: number;
  approved: number;
  pending: number;
  count: number;
}

export interface ExpenseGroup {
  label: string;
  rows: ExpenseRow[];
  subtotal: number;
}

export const GROUPS = ["all", "category", "date"] as const;
export type GroupBy = (typeof GROUPS)[number];
export const GROUP_LABEL: Record<GroupBy, string> = { all: "All", category: "By category", date: "By date" };

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const STATUS_VARIANT: Record<string, "success" | "secondary" | "destructive"> = {
  Approved: "success",
  Pending: "secondary",
  Rejected: "destructive",
};
