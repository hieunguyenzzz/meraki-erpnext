import { useMemo } from "react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { RotateCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatePanel } from "@/components/StatePanel";
import { RequestLeaveSheet } from "@/components/RequestLeaveSheet";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { LeaveBalanceCards } from "./LeaveBalanceCards";
import { LeaveBalanceTable } from "./LeaveBalanceTable";
import { LeaveHistory } from "./LeaveHistory";
import { RequestButtonBar } from "./RequestButtonBar";
import { STATUS_FILTERS, STATUS_LABEL, type StatusFilter } from "./types";
import { useMyLeaveApps } from "./useMyLeaveApps";
import { useMyLeaveBalances } from "./useMyLeaveBalances";

interface Props {
  employeeId: string;
  formOpen: boolean;
  onFormOpenChange: (open: boolean) => void;
}

/** Leave tab: balances table, history table and the request form beside them on desktop (D-MeLeave); cards and a sheet on phones. */
export function LeaveTab({ employeeId, formOpen, onFormOpenChange }: Props) {
  const desktop = useMediaQuery("(min-width: 768px)");
  const [status, setStatus] = useQueryState("status", parseAsStringLiteral(STATUS_FILTERS).withDefault("All").withOptions({ clearOnDefault: true }));

  const balances = useMyLeaveBalances(employeeId);
  const apps = useMyLeaveApps(employeeId, balances.refetch);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { All: apps.apps.length, Open: 0, Approved: 0, Rejected: 0 };
    for (const a of apps.apps) if (a.status === "Open" || a.status === "Approved" || a.status === "Rejected") c[a.status] += 1;
    return c;
  }, [apps.apps]);
  // The designer's desktop History has no status filter, so a ?status= left in the URL must not hide rows there.
  const filtered = useMemo(
    () => (desktop || status === "All" ? apps.apps : apps.apps.filter((a) => a.status === status)),
    [apps.apps, status, desktop],
  );

  function onSubmitted() {
    apps.refetch();
    balances.refetch();
  }

  const historyBody = (
    <>
      {apps.cancelError && (
        <div role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">{apps.cancelError}</div>
      )}
      {apps.isLoading ? (
        <div className="flex flex-col gap-2.5" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[110px] rounded-card md:h-14" />)}
        </div>
      ) : apps.isError ? (
        <StatePanel kind="error" title="Could not load your requests" text="Check your connection and try again." action={{ label: "Retry", onClick: apps.refetch, icon: <RotateCw className="h-4 w-4" /> }} />
      ) : filtered.length === 0 ? (
        <StatePanel
          kind="empty"
          title="No leave requests"
          text={apps.apps.length === 0 ? "Requests you send will show up here." : "No requests match this filter."}
        />
      ) : (
        <LeaveHistory apps={filtered} desktop={desktop} cancellingId={apps.cancellingId} onCancel={apps.cancel} />
      )}
    </>
  );

  if (desktop) {
    return (
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[999_1_480px] flex-col gap-4">
          <LeaveBalanceTable {...balances} />
          <section aria-label="Leave history" className="overflow-hidden rounded-card border bg-card">
            <h2 className="px-4 pb-1 pt-3.5 text-[17px] font-semibold">History</h2>
            {historyBody}
          </section>
        </div>
        <RequestLeaveSheet inline open={formOpen} onOpenChange={onFormOpenChange} onSuccess={onSubmitted} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Leave balance" className="flex flex-col gap-3">
        <LeaveBalanceCards {...balances} />
      </section>

      <section aria-label="Leave history" className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">History</h2>

        <div role="group" aria-label="Status" className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
              className={cn(
                "h-11 shrink-0 rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                status === s ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:bg-muted",
              )}
            >
              {STATUS_LABEL[s] ?? s} · {counts[s]}
            </button>
          ))}
        </div>

        {historyBody}
      </section>

      <RequestButtonBar label="Request leave" onClick={() => onFormOpenChange(true)} />
      <RequestLeaveSheet open={formOpen} onOpenChange={onFormOpenChange} onSuccess={onSubmitted} />
    </div>
  );
}
