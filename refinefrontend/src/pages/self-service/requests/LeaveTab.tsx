import { useMemo, useState } from "react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { Plus, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatePanel } from "@/components/StatePanel";
import { RequestLeaveSheet } from "@/components/RequestLeaveSheet";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { LeaveBalanceCards } from "./LeaveBalanceCards";
import { LeaveHistory } from "./LeaveHistory";
import { RequestButtonBar } from "./RequestButtonBar";
import { STATUS_FILTERS, STATUS_LABEL, type StatusFilter } from "./types";
import { useMyLeaveApps } from "./useMyLeaveApps";
import { useMyLeaveBalances } from "./useMyLeaveBalances";

/** Leave tab: balances (left on desktop, on top on phones) and request history. */
export function LeaveTab({ employeeId }: { employeeId: string }) {
  const desktop = useMediaQuery("(min-width: 768px)");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [status, setStatus] = useQueryState("status", parseAsStringLiteral(STATUS_FILTERS).withDefault("All").withOptions({ clearOnDefault: true }));

  const balances = useMyLeaveBalances(employeeId);
  const apps = useMyLeaveApps(employeeId, balances.refetch);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { All: apps.apps.length, Open: 0, Approved: 0, Rejected: 0 };
    for (const a of apps.apps) if (a.status === "Open" || a.status === "Approved" || a.status === "Rejected") c[a.status] += 1;
    return c;
  }, [apps.apps]);
  const filtered = useMemo(
    () => (status === "All" ? apps.apps : apps.apps.filter((a) => a.status === status)),
    [apps.apps, status],
  );

  function onSubmitted() {
    apps.refetch();
    balances.refetch();
  }

  return (
    <>
      <div className="grid gap-6 md:grid-cols-[320px_minmax(0,1fr)] md:items-start">
        <section aria-label="Leave balance" className="flex flex-col gap-3 md:sticky md:top-0">
          <LeaveBalanceCards {...balances} />
        </section>

        <section aria-label="Leave history" className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h2 className="flex-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:text-[17px] md:normal-case md:tracking-normal md:text-foreground">History</h2>
            <Button className="max-md:hidden" onClick={() => setSheetOpen(true)}>
              <Plus aria-hidden />
              Request leave
            </Button>
          </div>

          <div role="group" aria-label="Status" className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
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
        </section>
      </div>

      <RequestButtonBar label="Request leave" onClick={() => setSheetOpen(true)} />
      <RequestLeaveSheet open={sheetOpen} onOpenChange={setSheetOpen} onSuccess={onSubmitted} />
    </>
  );
}
