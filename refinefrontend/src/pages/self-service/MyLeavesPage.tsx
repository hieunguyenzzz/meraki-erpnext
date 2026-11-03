import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useMyEmployee } from "@/hooks/useMyEmployee";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { LeaveTab } from "./requests/LeaveTab";
import { WfhTab } from "./requests/WfhTab";
import { TABS } from "./requests/types";

const TAB_LABEL = { leave: "Leave", wfh: "Work from home" } as const;

/** Requests: leave and work-from-home on one page (?tab=leave|wfh). */
export default function MyLeavesPage() {
  const { employee, employeeId, isLoading } = useMyEmployee();
  const [tab, setTab] = useQueryState("tab", parseAsStringLiteral(TABS).withDefault("leave").withOptions({ clearOnDefault: true }));

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-11 rounded-full" />
        <Skeleton className="h-28 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    );
  }

  if (!employee || !employeeId) {
    return <p className="py-8 text-destructive">No employee record found. Please contact your administrator.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold leading-tight md:font-display md:text-4xl md:leading-10">Requests</h1>

      <div role="tablist" aria-label="Request type" className="flex rounded-full bg-muted p-1 md:w-fit md:gap-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "h-11 flex-1 rounded-full px-5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex-none",
              tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === "leave" ? <LeaveTab employeeId={employeeId} /> : <WfhTab employeeId={employeeId} />}
    </div>
  );
}
