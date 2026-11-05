export interface LeaveApp {
  name: string;
  employee: string;
  employee_name: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  total_leave_days: number;
  half_day?: number;
  status: string;
  docstatus: number;
  description: string;
}

export const TABS = ["applications", "balances"] as const;
export const STATUS_FILTERS = ["Open", "Approved", "Rejected", "All"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export function statusVariant(status: string) {
  switch (status) {
    case "Approved": return "success" as const;
    case "Rejected": return "destructive" as const;
    default: return "warning" as const;
  }
}

/** "2026-11-18" for one day, "2026-11-18 → 2026-11-19" for a range (ISO 8601). */
export function dateRange(from: string, to: string): string {
  return !to || from === to ? from : `${from} → ${to}`;
}

/** Days with a half-day marker; the number itself comes from the backend. */
export function daysLabel(app: LeaveApp): string {
  return app.half_day ? `${app.total_leave_days} (half day)` : String(app.total_leave_days);
}

/** Open applications and rejected ones (re-approve) can be decided. */
export function canDecide(app: LeaveApp): "decide" | "reapprove" | null {
  if (app.docstatus === 0 && app.status === "Open") return "decide";
  if (app.status === "Rejected") return "reapprove";
  return null;
}
