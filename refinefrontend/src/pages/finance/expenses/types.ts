export interface Expense {
  name: string;
  supplier: string;
  supplier_name: string;
  posting_date: string;
  grand_total: number;
  status: string;
  docstatus: number;
  custom_rejected: number | null;
  against_expense_account: string;
  project: string;
}

/** Per-PI extras resolved by GET /inquiry-api/expense/descriptions. */
export interface RowInfo {
  description: string;
  staff: string;
  note: string;
}

export interface ExpenseCategory {
  name: string;
  account_name: string;
}

export const STATUSES = ["Pending", "Approved", "Paid", "Rejected", "Cancelled"] as const;
export type ExpenseStatus = (typeof STATUSES)[number];

/** Same labels the backend's /expenses list uses (Pending / Approved / Rejected), plus Paid and Cancelled. */
export function expenseStatus(e: Pick<Expense, "docstatus" | "custom_rejected" | "status">): ExpenseStatus {
  if (e.docstatus === 2 || e.status === "Cancelled") return "Cancelled";
  if (e.docstatus === 0) return e.custom_rejected ? "Rejected" : "Pending";
  return e.status === "Paid" ? "Paid" : "Approved";
}

/** Only drafts (pending or rejected) can be edited; approved and paid expenses are locked by the backend (409). */
export const canEdit = (e: Pick<Expense, "docstatus">) => e.docstatus === 0;
export const lockedNote = (e: Pick<Expense, "status" | "docstatus">) =>
  e.docstatus === 2 || e.status === "Cancelled"
    ? "Cancelled expenses can't be edited. Add a new one."
    : `${e.status === "Paid" ? "Paid" : "Approved"} expenses can't be edited. Reject or cancel it and add a new one.`;

export function statusVariant(s: ExpenseStatus) {
  if (s === "Paid") return "success" as const;
  if (s === "Rejected" || s === "Cancelled") return "destructive" as const;
  if (s === "Pending") return "warning" as const;
  return "info" as const;
}

export const categoryLabel = (account: string | undefined | null) => (account ?? "").replace(/ - MWP$/, "");

export const isoDay = (d: string | undefined | null) => (d ?? "").slice(0, 10);

export async function responseError(res: Response, fallback: string): Promise<Error> {
  const data = await res.json().catch(() => ({}));
  return new Error(typeof data.detail === "string" ? data.detail : `${fallback} (${res.status})`);
}
