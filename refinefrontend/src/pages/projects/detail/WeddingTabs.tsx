import { useEffect, useState } from "react";
import { InternalNotesSection } from "@/components/crm/ActivitySection";
import { ProjectEventsTab } from "@/components/projects/ProjectEventsTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { WeddingEvent } from "@/lib/weddingEvents";
import { ExpensesTab } from "./ExpensesTab";
import { GlanceTab } from "./GlanceTab";
import { OverviewTab } from "./OverviewTab";
import { TasksTab } from "./TasksTab";
import { VendorsTab } from "./VendorsTab";
import type { WeddingData } from "./useWeddingData";
import type { useWeddingExpenses } from "./useWeddingExpenses";

interface Props {
  w: WeddingData;
  events: WeddingEvent[];
  expenses: ReturnType<typeof useWeddingExpenses>;
}

const triggerClass = "h-12 shrink-0 px-0 text-[15px]";

/** Tab bar and panels. Phones start on "Today" (at a glance); desktop starts on "Overview". */
export function WeddingTabs({ w, events, expenses }: Props) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [tab, setTab] = useState<string>(isDesktop ? "overview" : "today");
  const { name, project, tasks, showExpensesTab } = w;

  // Resizing across the breakpoint swaps Today <-> Overview.
  useEffect(() => {
    if (isDesktop && (tab === "today" || tab === "details")) setTab("overview");
    if (!isDesktop && tab === "overview") setTab("details");
  }, [isDesktop, tab]);

  const vendorCount: number = project?.custom_wedding_vendors?.length ?? 0;
  const openTasks = tasks.filter((t: any) => t.status !== "Completed" && t.status !== "Cancelled").length;

  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <TabsList className="h-12 w-full justify-start gap-6 overflow-x-auto lg:gap-7">
        {!isDesktop && <TabsTrigger value="today" className={triggerClass}>Today</TabsTrigger>}
        <TabsTrigger value={isDesktop ? "overview" : "details"} className={triggerClass}>{isDesktop ? "Overview" : "Details"}</TabsTrigger>
        <TabsTrigger value="vendors" className={triggerClass}>Vendors{vendorCount > 0 && ` · ${vendorCount}`}</TabsTrigger>
        <TabsTrigger value="events" className={triggerClass}>Events{events.length > 0 && ` · ${events.length}`}</TabsTrigger>
        <TabsTrigger value="tasks" className={triggerClass}>Tasks{openTasks > 0 && ` · ${openTasks} open`}</TabsTrigger>
        {showExpensesTab && <TabsTrigger value="expenses" className={triggerClass}>Expenses</TabsTrigger>}
        <TabsTrigger value="activity" className={triggerClass}>{isDesktop ? "Notes & activity" : "Notes"}</TabsTrigger>
      </TabsList>

      <TabsContent value="today" className="mt-4">
        <GlanceTab w={w} events={events} expenses={expenses} onOpenTab={setTab} />
      </TabsContent>
      <TabsContent value="overview" className="mt-4">
        <OverviewTab w={w} events={events} expenses={expenses} onOpenTab={setTab} />
      </TabsContent>
      <TabsContent value="details" className="mt-4">
        <OverviewTab w={w} events={events} expenses={expenses} onOpenTab={setTab} />
      </TabsContent>
      <TabsContent value="events" className="mt-4">
        <ProjectEventsTab projectId={name} venue={w.salesOrder?.custom_venue} />
      </TabsContent>
      <TabsContent value="vendors" className="mt-4">
        <VendorsTab w={w} />
      </TabsContent>
      <TabsContent value="tasks" className="mt-4">
        <TasksTab w={w} />
      </TabsContent>
      <TabsContent value="activity" className="mt-4">
        <InternalNotesSection references={[{ doctype: "Project", docName: name }]} />
      </TabsContent>
      {showExpensesTab && (
        <TabsContent value="expenses" className="mt-4">
          <ExpensesTab w={w} data={expenses} />
        </TabsContent>
      )}
    </Tabs>
  );
}
