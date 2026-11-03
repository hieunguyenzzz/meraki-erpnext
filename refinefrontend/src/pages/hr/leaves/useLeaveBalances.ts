import { useMemo, useRef, useState } from "react";
import { useInvalidate, useList } from "@refinedev/core";

export interface BalanceRow {
  employeeId: string;
  employeeName: string;
  allocName: string | null;
  leaveType: string | null;
  allocated: number;
  taken: number;
  remaining: number;
  fromDate: string | null;
  toDate: string | null;
}

interface AllocEdit {
  allocated?: number;
  remaining?: number;
  editedField?: "allocated" | "remaining";
}

interface EmployeeDoc { name: string; employee_name?: string; first_name?: string; last_name?: string }
interface AllocDoc {
  name: string; employee: string; leave_type: string;
  new_leaves_allocated?: number; total_leaves_allocated?: number; from_date?: string; to_date?: string;
}
interface ApprovedDoc { employee: string; leave_type: string; total_leave_days?: number }

export function displayName(e: EmployeeDoc): string {
  return [e.first_name, e.last_name].filter(Boolean).join(" ") || e.employee_name || e.name;
}

/** Pool label from the period: same-year periods are carry-over, year-spanning ones are annual (unchanged rule). */
export function poolOf(fromDate: string | null, toDate: string | null): "Carry-over" | "Annual" | null {
  if (!fromDate || !toDate) return null;
  return fromDate.slice(0, 4) === toDate.slice(0, 4) ? "Carry-over" : "Annual";
}

/** ISO month range, e.g. "2026-08 – 2027-07". */
export function formatPeriod(fromDate: string | null, toDate: string | null): string {
  if (!fromDate || !toDate) return "—";
  return `${fromDate.slice(0, 7)} – ${toDate.slice(0, 7)}`;
}

/**
 * Leave balances per employee and allocation. The maths is the page's original:
 * allocated = total_leaves_allocated (falling back to new_leaves_allocated), taken = sum of approved applications
 * of that type, remaining = allocated - taken. Edits write new_leaves_allocated through the backend.
 */
export function useLeaveBalances(enabled: boolean) {
  const invalidate = useInvalidate();
  const [edits, setEdits] = useState<Record<string, AllocEdit>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);

  const { result: allocsResult, query: allocsQuery } = useList({
    resource: "Leave Allocation",
    pagination: { mode: "off" },
    sorters: [{ field: "employee_name", order: "asc" }],
    filters: [
      { field: "docstatus", operator: "eq", value: 1 },
      { field: "leave_type", operator: "ne", value: "Sick Leave" },
    ],
    meta: { fields: ["name", "employee", "employee_name", "leave_type", "new_leaves_allocated", "total_leaves_allocated", "from_date", "to_date"] },
    queryOptions: { enabled },
  });
  const { result: employeesResult, query: employeesQuery } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "eq", value: "Active" }],
    meta: { fields: ["name", "employee_name", "first_name", "last_name"] },
  });
  const { result: approvedResult, query: approvedQuery } = useList({
    resource: "Leave Application",
    pagination: { mode: "off" },
    filters: [
      { field: "status", operator: "eq", value: "Approved" },
      { field: "docstatus", operator: "eq", value: 1 },
    ],
    meta: { fields: ["name", "employee", "leave_type", "total_leave_days"] },
    queryOptions: { enabled },
  });

  const employees = useMemo(() => (employeesResult?.data ?? []) as EmployeeDoc[], [employeesResult]);
  const allocs = useMemo(() => (allocsResult?.data ?? []) as AllocDoc[], [allocsResult]);
  const approved = useMemo(() => (approvedResult?.data ?? []) as ApprovedDoc[], [approvedResult]);

  const rows = useMemo(() => {
    const taken = new Map<string, Map<string, number>>();
    for (const app of approved) {
      if (!taken.has(app.employee)) taken.set(app.employee, new Map());
      const byType = taken.get(app.employee)!;
      byType.set(app.leave_type, (byType.get(app.leave_type) ?? 0) + (app.total_leave_days ?? 0));
    }
    const byEmployee = new Map<string, AllocDoc[]>();
    for (const a of allocs) {
      if (!byEmployee.has(a.employee)) byEmployee.set(a.employee, []);
      byEmployee.get(a.employee)!.push(a);
    }
    const out: BalanceRow[] = [];
    const sorted = [...employees].sort((a, b) => displayName(a).localeCompare(displayName(b)));
    for (const emp of sorted) {
      const name = displayName(emp);
      const list = byEmployee.get(emp.name);
      if (list && list.length > 0) {
        for (const alloc of list) {
          const allocated = alloc.total_leaves_allocated ?? alloc.new_leaves_allocated ?? 0;
          const t = taken.get(emp.name)?.get(alloc.leave_type) ?? 0;
          out.push({
            employeeId: emp.name, employeeName: name, allocName: alloc.name, leaveType: alloc.leave_type,
            allocated, taken: t, remaining: allocated - t, fromDate: alloc.from_date ?? null, toDate: alloc.to_date ?? null,
          });
        }
      } else {
        out.push({
          employeeId: emp.name, employeeName: name, allocName: null, leaveType: null,
          allocated: 0, taken: 0, remaining: 0, fromDate: null, toDate: null,
        });
      }
    }
    return out;
  }, [employees, allocs, approved]);

  function values(row: BalanceRow) {
    if (!row.allocName) return { allocated: null, remaining: null };
    const edit = edits[row.allocName];
    if (!edit) return { allocated: row.allocated, remaining: row.remaining };
    if (edit.editedField === "allocated") {
      const a = edit.allocated ?? row.allocated;
      return { allocated: a, remaining: a - row.taken };
    }
    if (edit.editedField === "remaining") {
      const r = edit.remaining ?? row.remaining;
      return { allocated: r + row.taken, remaining: r };
    }
    return { allocated: row.allocated, remaining: row.remaining };
  }

  function setAllocated(allocName: string, value: string) {
    const num = value === "" ? 0 : parseFloat(value);
    if (isNaN(num)) return;
    setEdits((prev) => ({ ...prev, [allocName]: { allocated: num, editedField: "allocated" } }));
  }

  async function save(allocName: string, taken: number) {
    const edit = edits[allocName];
    if (!edit || saving.current) return;
    saving.current = true;
    const newAllocated = edit.editedField === "allocated" ? edit.allocated ?? 0 : (edit.remaining ?? 0) + taken;
    setSavingId(allocName);
    setError(null);
    try {
      const res = await fetch(`/inquiry-api/leave/allocation/${encodeURIComponent(allocName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_leaves_allocated: newAllocated }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEdits((prev) => { const next = { ...prev }; delete next[allocName]; return next; });
      invalidate({ resource: "Leave Allocation", invalidates: ["list"] });
    } catch (err) {
      console.error("leave allocation save failed", allocName, err);
      setError(`Failed to update ${allocName}. ${err instanceof Error ? err.message : "Please try again."}`);
    } finally {
      saving.current = false;
      setSavingId(null);
    }
  }

  return {
    rows, employees, values, setAllocated, save, savingId, error, setError,
    isEdited: (allocName: string) => allocName in edits,
    isLoading: employeesQuery.isLoading || allocsQuery.isLoading || approvedQuery.isLoading,
    isError: employeesQuery.isError || allocsQuery.isError || approvedQuery.isError,
    refetch: () => { employeesQuery.refetch(); allocsQuery.refetch(); approvedQuery.refetch(); },
  };
}
