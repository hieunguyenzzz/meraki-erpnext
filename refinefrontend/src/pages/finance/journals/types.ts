import { createParser } from "nuqs";

export interface JournalEntry {
  name: string;
  posting_date: string;
  voucher_type: string;
  total_debit: number;
  total_credit: number;
  user_remark: string;
  docstatus: number;
}

export const STATUS_FILTERS = ["all", "Draft", "Submitted", "Cancelled"] as const;
export const TYPE_FILTERS = ["all", "Journal Entry", "Bank Entry", "Cash Entry"] as const;

export function statusOf(docstatus: number): "Draft" | "Submitted" | "Cancelled" {
  return docstatus === 1 ? "Submitted" : docstatus === 2 ? "Cancelled" : "Draft";
}

export function statusVariant(docstatus: number) {
  return docstatus === 1 ? ("success" as const) : docstatus === 2 ? ("destructive" as const) : ("secondary" as const);
}

export function typeVariant(type: string) {
  if (type === "Bank Entry") return "info" as const;
  if (type === "Cash Entry") return "warning" as const;
  return "default" as const;
}

/** ERPNext dates arrive as YYYY-MM-DD; show the date part. */
export const isoDate = (d: string | null | undefined) => (d ? d.slice(0, 10) : "—");

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** URL date param: only a real YYYY-MM-DD survives, anything else falls back to "" (no bound). */
export const parseAsIsoDate = createParser<string>({
  parse: (v) => (ISO.test(v) && !Number.isNaN(Date.parse(v)) ? v : null),
  serialize: (v) => v,
});
