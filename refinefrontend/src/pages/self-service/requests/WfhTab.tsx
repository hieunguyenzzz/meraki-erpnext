import { useMemo } from "react";
import { RotateCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatePanel } from "@/components/StatePanel";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { yearVN } from "@/lib/businessTime";
import { RequestButtonBar } from "./RequestButtonBar";
import { RequestWfhSheet } from "./RequestWfhSheet";
import { useMyWfh } from "./useMyWfh";
import { WfhHistory, wfhDays } from "./WfhHistory";

interface Props {
  employeeId: string;
  formOpen: boolean;
  onFormOpenChange: (open: boolean) => void;
}

/** WFH tab: history card with the request form beside it on desktop (D-MeWFH); cards and a sheet on phones. */
export function WfhTab({ employeeId, formOpen, onFormOpenChange }: Props) {
  const desktop = useMediaQuery("(min-width: 768px)");
  const { requests, isLoading, isError, refetch } = useMyWfh(employeeId);

  // "3 days used in 2026 · 1 pending": plain counts of the rows listed below.
  const summary = useMemo(() => {
    const year = String(yearVN());
    const used = requests.filter((r) => r.docstatus === 1 && r.custom_status !== "Rejected" && r.from_date.startsWith(year)).reduce((n, r) => n + wfhDays(r), 0);
    const pending = requests.filter((r) => r.docstatus === 0).length;
    return `${used} ${used === 1 ? "day" : "days"} used in ${year} · ${pending} pending`;
  }, [requests]);

  const body = isLoading ? (
    <div className="flex flex-col gap-2.5" aria-busy="true">
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[88px] rounded-card md:h-14" />)}
    </div>
  ) : isError ? (
    <StatePanel kind="error" title="Could not load your requests" text="Check your connection and try again." action={{ label: "Retry", onClick: refetch, icon: <RotateCw className="h-4 w-4" /> }} />
  ) : requests.length === 0 ? (
    <StatePanel kind="empty" title="No WFH requests yet" text="Requests you send will show up here." />
  ) : (
    <WfhHistory requests={requests} desktop={desktop} />
  );

  if (desktop) {
    return (
      <div className="flex flex-wrap items-start gap-4">
        <section aria-label="Work from home history" className="min-w-0 flex-[999_1_480px] overflow-hidden rounded-card border bg-card">
          <div className="flex items-baseline justify-between gap-3 px-4 pb-1 pt-3.5">
            <h2 className="text-[17px] font-semibold">History</h2>
            {!isLoading && !isError && <span className="text-[13px] text-muted-foreground">{summary}</span>}
          </div>
          {body}
        </section>
        <RequestWfhSheet inline employeeId={employeeId} open={formOpen} onOpenChange={onFormOpenChange} onSuccess={refetch} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Work from home history" className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">History</h2>
        {body}
      </section>

      <RequestButtonBar label="Request work from home" onClick={() => onFormOpenChange(true)} />
      <RequestWfhSheet employeeId={employeeId} open={formOpen} onOpenChange={onFormOpenChange} onSuccess={refetch} />
    </div>
  );
}
