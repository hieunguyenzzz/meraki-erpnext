import { formatVNDFull } from "@/lib/format";

export interface Payment {
  name: string;
  payment_type: string;
  party: string;
  party_name: string;
  posting_date: string;
  paid_amount: number;
  /** paid_amount in company currency (VND). */
  base_paid_amount?: number;
  /** paid_amount is expressed in the paid-from account's currency. */
  paid_from_account_currency?: string;
  paid_to_account_currency?: string;
  docstatus: number;
  description: string;
  category: string;
  linked_invoice: string;
}

export const TYPE_FILTERS = ["all", "Receive", "Pay", "Internal Transfer"] as const;

/** Receive = money in (success), Pay = money out (warning), Internal Transfer = neither (info). */
export function typeVariant(type: string) {
  if (type === "Receive") return "success" as const;
  if (type === "Pay") return "warning" as const;
  return "info" as const;
}

const MONEY = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The amount as entered: VND as usual, any other currency with its ISO code. */
export function formatPaid(amount: number, currency?: string) {
  if (!currency || currency === "VND") return formatVNDFull(amount);
  return `${currency} ${MONEY.format(amount)}`;
}

export function docstatusVariant(docstatus: number) {
  if (docstatus === 1) return "success" as const;
  if (docstatus === 2) return "destructive" as const;
  return "secondary" as const;
}

export function docstatusLabel(docstatus: number) {
  if (docstatus === 1) return "Submitted";
  if (docstatus === 2) return "Cancelled";
  return "Draft";
}

export const partyOf = (p: Payment) => p.party_name || p.party || "—";
