import type { Outcome } from "@/hooks/useNotificationActions";

/** An Attendance Request (reason = Work From Home) as /inquiry-api/wfh/list-all returns it. */
export interface WfhRequest {
  name: string;
  employee: string;
  employee_name: string;
  from_date: string;
  to_date: string;
  explanation: string;
  docstatus: number;
  custom_status?: string | null;
}

export type WfhStatus = "pending" | "approved" | "rejected" | "cancelled";

export const WFH_TABS = ["pending", "all"] as const;
export type WfhTab = (typeof WFH_TABS)[number];

/** Reject submits the document with custom_status = Rejected, so docstatus alone can't tell the two apart. */
export function statusOf(r: WfhRequest, outcome?: Outcome): WfhStatus {
  if (outcome) return outcome;
  if (r.docstatus === 0) return "pending";
  if (r.docstatus === 2) return "cancelled";
  return r.custom_status === "Rejected" ? "rejected" : "approved";
}

export const STATUS_LABEL: Record<WfhStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const STATUS_VARIANT = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
  cancelled: "secondary",
} as const;

export function calcDays(from: string, to: string): number {
  const f = new Date(`${from}T00:00:00`);
  const t = new Date(`${to}T00:00:00`);
  return Math.round((t.getTime() - f.getTime()) / 86400000) + 1;
}

/** ISO date, or an ISO range when the request spans several days. */
export function dateRange(from: string, to: string): string {
  return from === to ? from : `${from} to ${to}`;
}
