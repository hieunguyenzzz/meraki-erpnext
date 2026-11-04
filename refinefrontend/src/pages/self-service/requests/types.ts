export const TABS = ["leave", "wfh"] as const;
export type RequestsTab = (typeof TABS)[number];

export interface LeaveApplication {
  name: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  total_leave_days: number;
  status: string;
  description: string;
  docstatus: number;
}

/** Raw row from GET /inquiry-api/leave/balance. */
export interface BalanceItem {
  leave_type: string;
  old_allocation?: number;
  new_allocation?: number;
  old_taken?: number;
  old_pending?: number;
  new_taken?: number;
  new_pending?: number;
  old_accrued?: number;
  new_accrued?: number;
}

export interface LeaveBalance {
  leaveType: string;
  showOldPeriod: boolean;
  oldAllocDays: number;
  oldAccrued: number;
  oldTaken: number;
  oldPending: number;
  oldBalance: number;
  newAllocDays: number;
  newAccrued: number;
  newTaken: number;
  newPending: number;
  newBalance: number;
  totalBalance: number;
}

export interface WfhRequest {
  name: string;
  employee: string;
  employee_name: string;
  from_date: string;
  to_date: string;
  reason: string;
  explanation: string;
  docstatus: number;
  /** Set to "Rejected" when HR rejects: the request is then submitted, so docstatus alone reads as approved. */
  custom_status?: string | null;
}

/** Leave history filter; "Open" is shown to staff as "Pending". */
export const STATUS_FILTERS = ["All", "Open", "Approved", "Rejected"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];
export const STATUS_LABEL: Record<string, string> = { Open: "Pending" };

export function leaveStatusVariant(status: string) {
  switch (status) {
    case "Approved": return "success" as const;
    case "Rejected": return "destructive" as const;
    case "Open": return "warning" as const;
    default: return "secondary" as const;
  }
}

export function wfhStatus(docstatus: number, customStatus?: string | null) {
  if (docstatus === 1 && customStatus === "Rejected") return { label: "Rejected", variant: "destructive" as const };
  if (docstatus === 1) return { label: "Approved", variant: "success" as const };
  if (docstatus === 2) return { label: "Cancelled", variant: "destructive" as const };
  return { label: "Pending", variant: "warning" as const };
}

/** "2026-11-18" for one day, "2026-11-18 → 2026-11-19" for a range (ISO 8601). */
export function dateRange(from: string, to: string): string {
  return !to || from === to ? from : `${from} → ${to}`;
}
