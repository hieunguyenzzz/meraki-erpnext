import { useState } from "react";
import { Plus } from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useMyEmployee } from "@/hooks/useMyEmployee";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { MeTabs } from "@/components/MeTabs";
import { cn } from "@/lib/utils";
import { LeaveTab } from "./requests/LeaveTab";
import { WfhTab } from "./requests/WfhTab";
import { TABS } from "./requests/types";

const TAB_LABEL = { leave: "Leave", wfh: "Work from home" } as const;

/** Requests: leave and work-from-home on one page (?tab=leave|wfh). */
export default function MyLeavesPage() {
  const { employee, employeeId, isLoading } = useMyEmployee();
  const [, setStatus] = useQueryState("status");
  const [tab, setTab] = useQueryState("tab", parseAsStringLiteral(TABS).withDefault("leave").withOptions({ clearOnDefault: true }));
  // The open form belongs to the tab it was opened on, so switching tabs closes it.
  const [formTab, setFormTab] = useState<string | null>(null);
  if (formTab !== null && formTab !== tab) setFormTab(null);
  const formOpen = formTab === tab;
  const setFormOpen = (open: boolean) => setFormTab(open ? tab : null);

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
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-2xl font-semibold leading-tight md:font-display md:text-4xl md:leading-10">
          <span className="md:hidden">Requests</span>
          <span className="max-md:hidden">Me</span>
        </h1>
        <Button className="max-md:hidden" onClick={() => setFormOpen(true)}>
          <Plus aria-hidden />
          {tab === "leave" ? "Request leave" : "Request WFH"}
        </Button>
      </header>
      <MeTabs active={tab} />

      <div role="tablist" aria-label="Request type" className="flex rounded-full bg-muted p-1 md:hidden">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => { setTab(t); if (t !== "leave") setStatus(null); }}
            className={cn(
              "h-11 flex-1 rounded-full px-5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === "leave"
        ? <LeaveTab employeeId={employeeId} formOpen={formOpen} onFormOpenChange={setFormOpen} />
        : <WfhTab employeeId={employeeId} formOpen={formOpen} onFormOpenChange={setFormOpen} />}
    </div>
  );
}
