import { useMemo, useState } from "react";
import { useList } from "@refinedev/core";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HrAddLeaveSheet } from "@/components/HrAddLeaveSheet";
import { cn } from "@/lib/utils";
import { ApplicationsTab } from "./leaves/ApplicationsTab";
import { BalancesTab } from "./leaves/BalancesTab";
import { TABS, type LeaveApp } from "./leaves/types";
import { useLeaveActions } from "./leaves/useLeaveActions";
import { displayName, useLeaveBalances } from "./leaves/useLeaveBalances";

const TAB_LABEL = { applications: "Applications", balances: "Balances" } as const;

export default function LeavesPage() {
  const [tab, setTab] = useQueryState("tab", parseAsStringLiteral(TABS).withDefault("applications").withOptions({ clearOnDefault: true }));
  const [addLeaveOpen, setAddLeaveOpen] = useState(false);
  const actions = useLeaveActions();
  const balances = useLeaveBalances();

  const { result, query } = useList({
    resource: "Leave Application",
    pagination: { mode: "off" },
    filters: [{ field: "docstatus", operator: "ne", value: 2 }],
    sorters: [{ field: "creation", order: "desc" }],
    meta: { fields: ["name", "employee", "employee_name", "leave_type", "from_date", "to_date", "total_leave_days", "half_day", "status", "docstatus", "description"] },
  });
  const rawApps = useMemo(() => (result?.data ?? []) as LeaveApp[], [result]);

  // ERPNext sometimes returns HR-EMP-* codes as the name; resolve from the Employee record
  const apps = useMemo(() => {
    const names = new Map<string, string>();
    for (const e of balances.employees) {
      const n = [e.first_name, e.last_name].filter(Boolean).join(" ");
      if (n) names.set(e.name, n);
    }
    return rawApps.map((a) => {
      const resolved = names.get(a.employee);
      return resolved && (!a.employee_name || a.employee_name === a.employee || a.employee_name.startsWith("HR-EMP-"))
        ? { ...a, employee_name: resolved }
        : a;
    });
  }, [rawApps, balances.employees]);

  const employeeOptions = useMemo(
    () => balances.employees
      .map((e) => ({ name: e.name, displayName: displayName(e) }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [balances.employees],
  );

  const error = actions.error;
  return (
    <div className="flex flex-col gap-4 pb-24 md:pb-0">
      <header className="flex items-center gap-3">
        <h1 className="flex-1 text-2xl font-semibold leading-tight md:font-display md:text-4xl md:leading-10">Leaves</h1>
        <Button onClick={() => setAddLeaveOpen(true)}>
          <Plus aria-hidden />
          <span className="max-md:hidden">Add leave for someone</span>
          <span className="md:hidden">Add leave</span>
        </Button>
      </header>

      <div role="group" aria-label="Leave views" className="-mx-4 flex gap-7 border-b px-4 md:mx-0 md:px-0">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px h-12 border-b-2 text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-11",
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between rounded-xl border border-destructive/30 bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">
          <span>{error}</span>
          <button type="button" onClick={() => actions.setError(null)} aria-label="Dismiss" className="ml-4 font-medium">&times;</button>
        </div>
      )}

      {tab === "applications" ? (
        <ApplicationsTab
          apps={apps}
          isLoading={query.isLoading}
          isError={query.isError}
          refetch={() => query.refetch()}
          processingId={actions.processingId}
          isDeleting={actions.isDeleting}
          onDecide={actions.decide}
          onDelete={actions.deleteMany}
        />
      ) : (
        <BalancesTab b={balances} />
      )}

      <HrAddLeaveSheet open={addLeaveOpen} onOpenChange={setAddLeaveOpen} employees={employeeOptions} />
    </div>
  );
}
