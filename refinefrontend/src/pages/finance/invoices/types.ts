export interface Invoice {
  name: string;
  customer: string;
  customer_name: string;
  posting_date: string;
  due_date?: string | null;
  grand_total: number;
  outstanding_amount: number;
  status: string;
  custom_invoice_category: string;
  project?: string | null;
}

export interface Partner {
  name: string;
  customer_name: string;
}

export const STATUS_FILTERS = ["all", "Unpaid", "Overdue", "Paid", "Cancelled", "Return"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const TYPE_FILTERS = ["all", "Wedding Payment", "Referral Commission"] as const;
export type TypeFilter = (typeof TYPE_FILTERS)[number];

export function statusVariant(status: string) {
  if (status === "Paid") return "success" as const;
  if (status === "Overdue") return "destructive" as const;
  if (status === "Cancelled" || status === "Return" || status === "Draft") return "secondary" as const;
  return "warning" as const;
}

/** ERPNext dates arrive as YYYY-MM-DD (datetimes as "YYYY-MM-DD hh:mm:ss"); show the date part. */
export const isoDate = (d: string | null | undefined) => (d ? d.slice(0, 10) : "—");

/** Whole days past due for an unpaid, submitted invoice; null when it is not overdue. */
export function overdueDays(i: { docstatus?: number; due_date?: string | null; outstanding_amount: number }, today = new Date().toISOString().slice(0, 10)): number | null {
  if (i.docstatus !== 1 || !i.due_date || !(i.outstanding_amount > 0) || i.due_date.slice(0, 10) >= today) return null;
  return Math.round((Date.parse(today) - Date.parse(i.due_date.slice(0, 10))) / 86_400_000);
}
