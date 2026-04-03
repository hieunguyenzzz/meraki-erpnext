import { useEffect, useMemo, useState } from "react";
import { usePermissions } from "@refinedev/core";
import { LayoutGrid, LayoutList, Plus } from "lucide-react";
import { Link } from "react-router";
import { type ColumnDef } from "@tanstack/react-table";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { ProjectKanbanCard } from "@/components/projects/ProjectKanbanCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { type FilterableColumn } from "@/components/data-table/data-table-toolbar";
import {
  PROJECT_COLUMNS,
  getProjectColumnKey,
  formatDaysUntilWedding,
  type ProjectKanbanItem,
} from "@/lib/projectKanban";
import { CreateWeddingDialog } from "./CreateWeddingDialog";
import { hasModuleAccess, FINANCE_ROLES, WEDDING_MANAGER_ROLES } from "@/lib/roles";
import { useMyEmployee } from "@/hooks/useMyEmployee";

export default function ProjectKanbanPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"kanban" | "list">(() =>
    (localStorage.getItem("wedding-view-mode") as "kanban" | "list") || "list"
  );
  const [yearFilter, setYearFilter] = useState<string | null>(String(new Date().getFullYear()));
  const { data: roles } = usePermissions<string[]>({});
  const isFinance = hasModuleAccess(roles ?? [], FINANCE_ROLES);
  const { employeeId } = useMyEmployee();
  const isWeddingManager = hasModuleAccess(roles ?? [], WEDDING_MANAGER_ROLES);
  const [showMyWeddings, setShowMyWeddings] = useState<boolean>(() => {
    const stored = localStorage.getItem("wedding-my-filter");
    if (stored !== null) return stored === "true";
    return false;
  });

  useEffect(() => {
    if (!roles) return;
    if (!hasModuleAccess(roles, WEDDING_MANAGER_ROLES)) {
      setShowMyWeddings(true);
    } else if (localStorage.getItem("wedding-my-filter") === null) {
      setShowMyWeddings(false);
    }
  }, [roles]);

  const handleViewChange = (mode: "kanban" | "list") => {
    setViewMode(mode);
    localStorage.setItem("wedding-view-mode", mode);
  };

  // Fetch all project data from backend (replaces 6 separate useList calls)
  const [items, setItems] = useState<ProjectKanbanItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/inquiry-api/projects/kanban", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setItems(data?.data ?? []))
      .catch(() => setItems([]))
      .finally(() => setIsLoading(false));
  }, []);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    for (const item of items) {
      const year = item.expected_end_date?.slice(0, 4);
      if (year) years.add(year);
    }
    return [...years].sort().reverse();
  }, [items]);

  const filteredItems = useMemo(() => {
    let result = items;
    if (yearFilter) {
      result = result.filter((p) => p.expected_end_date?.startsWith(yearFilter));
    }
    if (showMyWeddings && employeeId) {
      const FIELDS = [
        "custom_lead_planner", "custom_support_planner",
        "custom_assistant_1", "custom_assistant_2", "custom_assistant_3",
        "custom_assistant_4", "custom_assistant_5",
      ] as const;
      result = result.filter((p) =>
        FIELDS.some((f) => p[f] === employeeId)
      );
    }
    return result;
  }, [items, yearFilter, showMyWeddings, employeeId]);

  const columns = useMemo<ColumnDef<ProjectKanbanItem>[]>(() => {
    const cols: ColumnDef<ProjectKanbanItem>[] = [
      {
        accessorKey: "customer_name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Couple" />,
        cell: ({ row }) => (
          <Link
            to={`/projects/${row.original.id}`}
            className="font-medium hover:underline"
          >
            {row.getValue("customer_name")}
          </Link>
        ),
      },
      {
        accessorKey: "expected_end_date",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Wedding Date" />,
        cell: ({ row }) => {
          const date = row.getValue("expected_end_date") as string;
          if (!date) return <span className="text-muted-foreground">{"\u2014"}</span>;
          const { text, color } = formatDaysUntilWedding(date);
          return (
            <div className="flex items-center gap-2">
              <span>{new Date(date).toLocaleDateString("vi-VN")}</span>
              <Badge variant="outline" className={`text-${color}-600 border-${color}-200`}>{text}</Badge>
            </div>
          );
        },
      },
      {
        accessorKey: "custom_project_stage",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Stage" />,
        cell: ({ row }) => <Badge variant="secondary">{row.getValue("custom_project_stage")}</Badge>,
        filterFn: "arrIncludesSome",
      },
      {
        accessorKey: "venue_name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Venue" />,
        cell: ({ row }) => row.getValue("venue_name") ?? <span className="text-muted-foreground">{"\u2014"}</span>,
      },
      {
        accessorKey: "lead_planner_name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Lead Planner" />,
        cell: ({ row }) => row.getValue("lead_planner_name") ?? <span className="text-muted-foreground">{"\u2014"}</span>,
      },
    ];
    if (isFinance) {
      cols.push(
        {
          accessorKey: "custom_service_type",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Package" />,
          cell: ({ row }) => {
            const type = row.getValue("custom_service_type") as string | undefined;
            if (!type) return <span className="text-muted-foreground">{"\u2014"}</span>;
            return <Badge variant={type.toLowerCase().includes("full") ? "default" : "secondary"}>{type}</Badge>;
          },
        },
        {
          accessorKey: "package_amount",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
          cell: ({ row }) => {
            const amount = row.getValue("package_amount") as number | undefined;
            return amount
              ? <span>{amount.toLocaleString("vi-VN")} {"\u20AB"}</span>
              : <span className="text-muted-foreground">{"\u2014"}</span>;
          },
        },
        {
          accessorKey: "tax_type",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Tax" />,
          cell: ({ row }) => {
            const type = row.getValue("tax_type") as string | undefined;
            if (!type) return <span className="text-muted-foreground">{"\u2014"}</span>;
            return type === "vat_included"
              ? <Badge variant="outline" className="text-amber-600 border-amber-200">VAT</Badge>
              : <Badge variant="outline" className="text-green-600 border-green-200">Tax Free</Badge>;
          },
          filterFn: "arrIncludesSome",
        },
        {
          accessorKey: "commission_base",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Commission Base" />,
          cell: ({ row }) => {
            const amount = row.getValue("commission_base") as number | undefined;
            return amount
              ? <span>{amount.toLocaleString("vi-VN")} {"\u20AB"}</span>
              : <span className="text-muted-foreground">{"\u2014"}</span>;
          },
        },
        {
          accessorKey: "per_billed",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Paid" />,
          cell: ({ row }) => {
            const pct = row.getValue("per_billed") as number | undefined;
            if (pct == null) return <span className="text-muted-foreground">{"\u2014"}</span>;
            const rounded = Math.round(pct);
            const color = rounded >= 100 ? "text-green-600" : rounded >= 50 ? "text-amber-600" : "text-muted-foreground";
            return <span className={`font-medium ${color}`}>{rounded}%</span>;
          },
        },
      );
    }
    cols.push({
      id: "actions",
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/projects/${row.original.id}`}>View {"\u2192"}</Link>
        </Button>
      ),
    });
    return cols;
  }, [isFinance]);

  const filterableColumns: FilterableColumn[] = useMemo(() => [
    {
      id: "custom_project_stage",
      title: "Stage",
      options: PROJECT_COLUMNS.map(col => ({ label: col.label, value: col.stages[0] })),
    },
  ], []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Weddings</h1>
          <p className="text-sm text-muted-foreground">
            Manage wedding projects by stage
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border rounded-md p-1">
            <Button
              variant={viewMode === "kanban" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => handleViewChange("kanban")}
              title="Kanban view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => handleViewChange("list")}
              title="List view"
            >
              <LayoutList className="h-4 w-4" />
            </Button>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Wedding
          </Button>
        </div>
      </div>

      <CreateWeddingDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      <div className="flex items-center gap-3 flex-wrap">
        {employeeId && isWeddingManager && (
          <div className="flex items-center gap-1 border rounded-md p-1">
            <Button
              variant={showMyWeddings ? "default" : "ghost"}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => { setShowMyWeddings(true); localStorage.setItem("wedding-my-filter", "true"); }}
            >My Weddings</Button>
            <Button
              variant={!showMyWeddings ? "default" : "ghost"}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => { setShowMyWeddings(false); localStorage.setItem("wedding-my-filter", "false"); }}
            >All Weddings</Button>
          </div>
        )}
        {availableYears.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              variant={yearFilter === null ? "default" : "outline"}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setYearFilter(null)}
            >All</Button>
            {availableYears.map((year) => (
              <Button
                key={year}
                variant={yearFilter === year ? "default" : "outline"}
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => setYearFilter(year === yearFilter ? null : year)}
              >{year}</Button>
            ))}
          </div>
        )}
      </div>

      {viewMode === "list" ? (
        <DataTable
          columns={columns}
          data={filteredItems}
          isLoading={isLoading}
          searchKey="customer_name"
          searchPlaceholder="Search couple..."
          filterableColumns={filterableColumns}
        />
      ) : isLoading ? (
        <>
          {/* Desktop skeleton */}
          <div className="hidden md:grid grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg border border-muted p-3 space-y-3 min-h-[300px]"
              >
                <Skeleton className="h-4 w-[60px]" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ))}
          </div>
          {/* Mobile skeleton */}
          <div className="md:hidden space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-20 shrink-0 rounded-lg" />
              ))}
            </div>
            <div className="rounded-lg border border-muted p-3 space-y-3 min-h-[200px]">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        </>
      ) : (
        <>
          <KanbanBoard
            items={filteredItems}
            columns={PROJECT_COLUMNS}
            getColumnForItem={(item: ProjectKanbanItem) =>
              getProjectColumnKey(item)
            }
            renderCard={(item: ProjectKanbanItem) => (
              <ProjectKanbanCard key={item.id} item={item} />
            )}
          />
          <div className="hidden md:block mt-6 text-xs text-muted-foreground">
            <p className="mb-2 font-medium text-foreground uppercase tracking-wide">
              Stage Guide
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
              <div>
                <span className="font-medium text-foreground">Onboarding</span>{" "}
                -- Contract signed, initial planning
              </div>
              <div>
                <span className="font-medium text-foreground">Planning</span> --
                Vendor selection, timeline
              </div>
              <div>
                <span className="font-medium text-foreground">
                  Final Details
                </span>{" "}
                -- Last month preparations
              </div>
              <div>
                <span className="font-medium text-foreground">Wedding Week</span>{" "}
                -- Final rehearsals, confirmations
              </div>
              <div>
                <span className="font-medium text-foreground">Day-of</span> --
                Wedding day coordination
              </div>
              <div>
                <span className="font-medium text-foreground">Completed</span> --
                Post-wedding wrap up
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
