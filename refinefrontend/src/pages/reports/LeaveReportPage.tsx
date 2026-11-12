import { useCallback, useEffect, useState } from "react";
import { parseAsBoolean, parseAsStringLiteral, useQueryState } from "nuqs";
import { Eye, EyeOff, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatePanel } from "@/components/StatePanel";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { yearVN } from "@/lib/businessTime";
import { ReportsHeader } from "./ReportsHeader";
import { LeaveCard } from "./leave/LeaveCard";
import { LeaveTable } from "./leave/LeaveTable";
import { STATUSES, type LeaveReportData } from "./leave/types";

const opts = { clearOnDefault: true } as const;

export default function LeaveReportPage() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  // Filters live in the URL so Back restores them; junk values fall back to the defaults.
  const [status, setStatus] = useQueryState("status", parseAsStringLiteral(STATUSES).withDefault("Active").withOptions(opts));
  const [showAllocation, setShowAllocation] = useQueryState("allocation", parseAsBoolean.withDefault(false).withOptions(opts));

  const [report, setReport] = useState<LeaveReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    const ctrl = new AbortController();
    setIsLoading(true);
    setError(null);
    fetch(`/inquiry-api/reports/leave-report?status=${status}`, { credentials: "include", signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setReport(data))
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        console.error("Leave report failed to load", e);
        setError(e);
      })
      .finally(() => { if (!ctrl.signal.aborted) setIsLoading(false); });
    return () => ctrl.abort();
  }, [status]);
  useEffect(load, [load]);

  const rows = report?.data ?? [];
  const year = report?.current_year ?? yearVN();

  let body;
  if (error !== null) {
    body = (
      <StatePanel
        kind="error"
        title="Couldn't load the leave report"
        text="The server didn't answer. Your data is safe."
        action={{ label: "Try again", onClick: () => load(), icon: <RotateCw className="h-4 w-4" /> }}
      />
    );
  } else if (isLoading) {
    body = (
      <div className="flex flex-col gap-3" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-card md:h-12" />)}
      </div>
    );
  } else if (rows.length === 0) {
    body = <StatePanel kind="empty" title="No employees found" text={`No ${status === "All" ? "" : status.toLowerCase() + " "}employees have leave records.`} />;
  } else if (isDesktop) {
    body = <LeaveTable rows={rows} year={year} showAllocation={showAllocation} />;
  } else {
    body = <div className="flex flex-col gap-3">{rows.map((r) => <LeaveCard key={r.employee} r={r} year={year} showAllocation={showAllocation} />)}</div>;
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <ReportsHeader />

      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-muted-foreground">
          Team leave calendar {year} &middot; leave year resets 1 Aug
          {!isLoading && error === null && <> &middot; <b className="text-foreground">{rows.length}</b> employees</>}
        </p>
        <Select value={status} onValueChange={(v) => void setStatus(v as (typeof STATUSES)[number])}>
          <SelectTrigger aria-label="Staff status" className="w-[130px] md:h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" className="max-md:h-12 md:h-9" onClick={() => void setShowAllocation(!showAllocation)}>
          {showAllocation ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {showAllocation ? "Hide" : "Show"} {year} allocation
        </Button>
      </div>

      {body}

      <p className="text-xs text-muted-foreground">
        {year - 1} Left over / Taken = leave carried over from the {year - 1} allocation, usable from {year}-01-01 to {year}-07-31.
        {" "}{year} Allocation / Taken = new annual leave from {year}-08-01 to {year + 1}-07-31.
        {" "}{year} Usable = accrued so far this year (not the full annual amount).
      </p>
    </div>
  );
}
