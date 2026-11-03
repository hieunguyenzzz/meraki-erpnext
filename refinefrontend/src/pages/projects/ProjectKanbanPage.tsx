import { useEffect, useMemo, useState } from "react";
import { usePermissions, useList } from "@refinedev/core";
import { LayoutGrid, LayoutList, Plus, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type PlannerEmployee } from "@/components/projects/PlannerCell";
import { hasModuleAccess, FINANCE_ROLES, CRM_ROLES } from "@/lib/roles";
import { useMyEmployee } from "@/hooks/useMyEmployee";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { CreateWeddingSheet } from "./create-wedding/CreateWeddingSheet";
import { FilterBar } from "./weddings-list/FilterBar";
import { StatePanel } from "@/components/StatePanel";
import { WeddingCards, WeddingCardsSkeleton } from "./weddings-list/WeddingCards";
import { WeddingsBoard, WeddingsBoardSkeleton } from "./weddings-list/WeddingsBoard";
import { WeddingsTable, WeddingsTableSkeleton } from "./weddings-list/WeddingsTable";
import { useWeddingColumns } from "./weddings-list/weddingColumns";
import { useWeddingFilters } from "./weddings-list/useWeddingFilters";
import { useWeddingsData } from "./weddings-list/useWeddingsData";

type ViewMode = "kanban" | "list";
const VIEW_KEY = "wedding-view-mode";

function readViewMode(): ViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === "kanban" ? "kanban" : "list";
  } catch (err) {
    console.error("Read view mode failed", err);
    return "list";
  }
}

export default function ProjectKanbanPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(readViewMode);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const { data: roles } = usePermissions<string[]>({});
  const isFinance = hasModuleAccess(roles ?? [], FINANCE_ROLES);
  const canEditPlanners = hasModuleAccess(roles ?? [], CRM_ROLES);
  const { employeeId } = useMyEmployee();

  const { items, staffOptions, isLoading, error, reload, patchPlanner } = useWeddingsData();
  const f = useWeddingFilters(items);

  // Active employees for the inline planner dropdowns (only when editing is allowed)
  const { result: employeesResult } = useList<PlannerEmployee>({
    resource: "Employee",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "eq", value: "Active" }],
    meta: { fields: ["name", "employee_name", "first_name", "last_name"] },
    queryOptions: { enabled: canEditPlanners },
  });
  const employees = useMemo(() => (employeesResult?.data ?? []) as PlannerEmployee[], [employeesResult]);
  const columns = useWeddingColumns({ isFinance, canEditPlanners, employees, onPlannerUpdated: patchPlanner });

  // The list has stage chips; the board already has a column per stage.
  const showBoard = isDesktop && viewMode === "kanban";
  const visible = showBoard ? f.unstaged : f.staged;

  // Show the skeleton only after 300 ms so quick loads don't flash.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), 300);
    return () => clearTimeout(t);
  }, [isLoading]);

  const changeView = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_KEY, mode);
    } catch (err) {
      console.error("Save view mode failed", err);
    }
  };

  let body;
  if (error) {
    body = (
      <StatePanel
        kind="error"
        title="Couldn't load weddings"
        text="The server didn't answer. Your data is safe."
        action={{ label: "Try again", onClick: reload, icon: <RotateCw className="h-4 w-4" /> }}
      />
    );
  } else if (isLoading) {
    body = !slow ? null : showBoard ? <WeddingsBoardSkeleton /> : isDesktop ? <WeddingsTableSkeleton /> : <WeddingCardsSkeleton />;
  } else if (visible.length === 0 && !showBoard) {
    body = (
      <StatePanel
        kind="empty"
        title={f.isFiltered ? "No weddings match" : "No weddings yet"}
        text={f.isFiltered ? "Try a different year, stage or search." : "Create the first wedding to start planning."}
        action={f.isFiltered ? undefined : { label: "New wedding", onClick: () => setCreateOpen(true) }}
      />
    );
  } else if (showBoard) {
    body = <WeddingsBoard items={visible} />;
  } else if (isDesktop) {
    body = <WeddingsTable data={visible} columns={columns} />;
  } else {
    body = <WeddingCards items={visible} showPaid={isFinance} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-3">
        <h1 className="flex-1 text-2xl font-semibold leading-tight md:font-display md:text-4xl md:leading-10">Weddings</h1>
        {isDesktop && (
          <div role="group" aria-label="View" className="flex rounded-full bg-secondary p-[3px]">
            {([["kanban", "Board", LayoutGrid], ["list", "List", LayoutList]] as const).map(([mode, label, Icon]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={viewMode === mode}
                onClick={() => changeView(mode)}
                className={cn(
                  "flex h-[34px] items-center gap-1.5 rounded-full px-3.5 text-sm transition-colors",
                  viewMode === mode ? "bg-card font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>
        )}
        <Button onClick={() => setCreateOpen(true)} className="shrink-0">
          <Plus className="h-4 w-4" />
          New wedding
        </Button>
      </header>

      <CreateWeddingSheet open={createOpen} onOpenChange={setCreateOpen} />

      <FilterBar
        query={f.query}
        onQuery={f.setQuery}
        type={f.type}
        onType={f.setType}
        year={f.year}
        onYear={f.setYear}
        years={f.availableYears}
        staff={f.staff}
        onStaff={f.setStaff}
        staffOptions={staffOptions}
        myEmployeeId={employeeId ?? undefined}
        showStages={!showBoard}
        stage={f.stage}
        onStage={f.setStage}
        stageCounts={f.stageCounts}
        total={f.unstaged.length}
      />

      {body}
    </div>
  );
}
