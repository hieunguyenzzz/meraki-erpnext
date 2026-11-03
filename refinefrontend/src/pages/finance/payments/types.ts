export interface Payment {
  name: string;
  payment_type: string;
  party: string;
  party_name: string;
  posting_date: string;
  paid_amount: number;
  docstatus: number;
  description: string;
  category: string;
  linked_invoice: string;
}

export const TYPE_FILTERS = ["all", "Receive", "Pay", "Internal Transfer"] as const;

/** Receive = money in (success); Pay / Internal Transfer keep the previous warning tone. */
export function typeVariant(type: string) {
  return type === "Receive" ? ("success" as const) : ("warning" as const);
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
