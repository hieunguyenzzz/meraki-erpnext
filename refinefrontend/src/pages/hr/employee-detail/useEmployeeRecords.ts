import { useMemo, useRef, useState } from "react";
import { useInvalidate, useList } from "@refinedev/core";
import type { EmployeeRecord } from "./types";

interface LeaveRow {
  name: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  total_leave_days: number;
  status: string;
  docstatus: number;
}

interface WfhRow {
  name: string;
  from_date: string;
  to_date: string;
  explanation?: string;
  docstatus: number;
}

/** Leave + WFH history for one employee, merged newest first, with approve / reject actions. */
export function useEmployeeRecords(employee: string | undefined, onLeaveChanged: () => void) {
  const invalidate = useInvalidate();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const busy = useRef(false);

  const { result: leaveResult } = useList({
    resource: "Leave Application",
    pagination: { mode: "off" },
    filters: [{ field: "employee", operator: "eq", value: employee }],
    sorters: [{ field: "from_date", order: "desc" }],
    meta: { fields: ["name", "leave_type", "from_date", "to_date", "total_leave_days", "status", "docstatus", "description"] },
    queryOptions: { enabled: !!employee },
  });
  const { result: wfhResult } = useList({
    resource: "Attendance Request",
    pagination: { mode: "off" },
    filters: [
      { field: "employee", operator: "eq", value: employee },
      { field: "reason", operator: "eq", value: "Work From Home" },
    ],
    sorters: [{ field: "from_date", order: "desc" }],
    meta: { fields: ["name", "from_date", "to_date", "explanation", "docstatus"] },
    queryOptions: { enabled: !!employee },
  });
  const leaveHistory = (leaveResult?.data ?? []) as unknown as LeaveRow[];
  const wfhRequests = (wfhResult?.data ?? []) as unknown as WfhRow[];

  const records = useMemo<EmployeeRecord[]>(() => {
    const leaves = leaveHistory.map((a) => {
      const isPending = a.docstatus === 0 && a.status === "Open";
      return {
        id: a.name,
        type: "leave" as const,
        from_date: a.from_date,
        to_date: a.to_date,
        days: a.total_leave_days,
        details: a.leave_type,
        status: isPending ? "Pending" : a.status,
        isPending,
      };
    });
    const wfhs = wfhRequests.map((r) => {
      const days =
        r.from_date && r.to_date
          ? Math.ceil((new Date(r.to_date).getTime() - new Date(r.from_date).getTime()) / 86400000) + 1
          : 1;
      return {
        id: r.name,
        type: "wfh" as const,
        from_date: r.from_date,
        to_date: r.to_date,
        days,
        details: r.explanation || "-",
        status: r.docstatus === 1 ? "Approved" : "Pending",
        isPending: r.docstatus === 0,
      };
    });
    return [...leaves, ...wfhs].sort((a, b) => new Date(b.from_date).getTime() - new Date(a.from_date).getTime());
  }, [leaveHistory, wfhRequests]);

  const pendingCount = records.filter((r) => r.isPending).length;

  async function act(kind: "leave" | "wfh", verb: "approve" | "reject", id: string) {
    if (busy.current) return;
    busy.current = true;
    setProcessingId(id);
    setRecordsError(null);
    try {
      const resp = await fetch(`/inquiry-api/${kind}/${encodeURIComponent(id)}/${verb}`, { method: "POST" });
      if (!resp.ok) throw new Error(`Failed to ${verb} ${id}`);
      invalidate({ resource: kind === "leave" ? "Leave Application" : "Attendance Request", invalidates: ["list"] });
      if (kind === "leave" && verb === "approve") onLeaveChanged();
    } catch (err) {
      console.error(`Could not ${verb} ${kind} request ${id}`, err);
      setRecordsError(`Failed to ${verb} ${id}`);
    } finally {
      busy.current = false;
      setProcessingId(null);
    }
  }

  return {
    records,
    pendingCount,
    processingId,
    recordsError,
    approve: (r: EmployeeRecord) => act(r.type, "approve", r.id),
    reject: (r: EmployeeRecord) => act(r.type, "reject", r.id),
  };
}
