import { useMemo, useState } from "react";
import { useList } from "@refinedev/core";
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

export default function ProjectKanbanPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"kanban" | "list">(() =>
    (localStorage.getItem("wedding-view-mode") as "kanban" | "list") || "list"
  );
  const [yearFilter, setYearFilter] = useState<string | null>(String(new Date().getFullYear()));

  const handleViewChange = (mode: "kanban" | "list") => {
    setViewMode(mode);
    localStorage.setItem("wedding-view-mode", mode);
  };

  // Fetch Projects
  const { result: projectsResult, query: projectsQuery } = useList({
    resource: "Project",
    pagination: { mode: "off" },
    filters: [
      { field: "status", operator: "in", value: ["Open", "Completed"] },
    ],
    meta: {
      fields: [
        "name",
        "project_name",
        "status",
        "custom_project_stage",
        "customer",
        "expected_end_date",
        "sales_order",
        "custom_lead_planner",
        "custom_support_planner",
      ],
    },
  });

  // Fetch Sales Orders for venue info and package amount
  const { result: salesOrdersResult } = useList({
    resource: "Sales Order",
    pagination: { mode: "off" },
    filters: [{ field: "docstatus", operator: "in", value: [0, 1] }],
    meta: {
      fields: ["name", "customer_name", "custom_venue", "grand_total", "per_billed"],
    },
  });

  // Fetch Employees for planner names (all statuses, not just Active)
  const { result: employeesResult } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    meta: { fields: ["name", "employee_name"] },
  });

  // Fetch Suppliers for venue names
  const { result: suppliersResult } = useList({
    resource: "Supplier",
    pagination: { mode: "off" },
    meta: { fields: ["name", "supplier_name"] },
  });

  // Fetch Customers for customer names
  const { result: customersResult } = useList({
    resource: "Customer",
    pagination: { mode: "off" },
    meta: {
      fields: ["name", "customer_name"],
    },
  });

  // Build kanban items
  const items = useMemo<ProjectKanbanItem[]>(() => {
    const projects = projectsResult?.data ?? [];
    const salesOrders = salesOrdersResult?.data ?? [];
    const customers = customersResult?.data ?? [];
    const employees = employeesResult?.data ?? [];
    const suppliers = suppliersResult?.data ?? [];

    // Build lookup maps
    const soByName = new Map(
      salesOrders.map((so: any) => [so.name, so])
    );
    const customerByName = new Map(
      customers.map((c: any) => [c.name, c])
    );
    const employeeByName = new Map(
      employees.map((e: any) => [e.name, e.employee_name])
    );
    const supplierByName = new Map(
      suppliers.map((s: any) => [s.name, s.supplier_name])
    );

    return projects.map((p: any) => {
      const linkedSO = p.sales_order ? soByName.get(p.sales_order) : null;
      const linkedCustomer = p.customer ? customerByName.get(p.customer) : null;

      return {
        id: p.name,
        project_name: p.project_name,
        status: p.status,
        custom_project_stage: p.custom_project_stage || "Planning",
        customer: p.customer,
        customer_name: linkedCustomer?.customer_name || linkedSO?.customer_name || p.project_name,
        expected_end_date: p.expected_end_date,
        sales_order: p.sales_order,
        venue_name: linkedSO?.custom_venue
          ? (supplierByName.get(linkedSO.custom_venue) ?? linkedSO.custom_venue)
          : undefined,
        lead_planner_name: p.custom_lead_planner ? employeeByName.get(p.custom_lead_planner) : undefined,
        support_planner_name: p.custom_support_planner ? employeeByName.get(p.custom_support_planner) : undefined,
        package_amount: linkedSO?.grand_total,
        per_billed: linkedSO?.per_billed,
      };
    });
  }, [projectsResult, salesOrdersResult, customersResult, employeesResult, suppliersResult]);

  const isLoading = projectsQuery?.isLoading;

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    for (const item of items) {
      const year = item.expected_end_date?.slice(0, 4);
      if (year) years.add(year);
    }
    return [...years].sort().reverse();
  }, [items]);

  const filteredItems = useMemo(() => {
    if (!yearFilter) return items;
    return items.filter((p) => p.expected_end_date?.startsWith(yearFilter));
  }, [items, yearFilter]);

  const columns = useMemo<ColumnDef<ProjectKanbanItem>[]>(() => [
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
        if (!date) return <span className="text-muted-foreground">—</span>;
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
      cell: ({ row }) => row.getValue("venue_name") ?? <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: "lead_planner_name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Lead Planner" />,
      cell: ({ row }) => row.getValue("lead_planner_name") ?? <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: "package_amount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Package" />,
      cell: ({ row }) => {
        const amount = row.getValue("package_amount") as number | undefined;
        return amount
          ? <span>{amount.toLocaleString("vi-VN")} ₫</span>
          : <span className="text-muted-foreground">—</span>;
      },
    },
    {
      accessorKey: "per_billed",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Paid" />,
      cell: ({ row }) => {
        const pct = row.getValue("per_billed") as number | undefined;
        if (pct == null) return <span className="text-muted-foreground">—</span>;
        const rounded = Math.round(pct);
        const color = rounded >= 100 ? "text-green-600" : rounded >= 50 ? "text-amber-600" : "text-muted-foreground";
        return <span className={`font-medium ${color}`}>{rounded}%</span>;
      },
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/projects/${row.original.id}`}>View →</Link>
        </Button>
      ),
    },
  ], []);

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
                — Contract signed, initial planning
              </div>
              <div>
                <span className="font-medium text-foreground">Planning</span> —
                Vendor selection, timeline
              </div>
              <div>
                <span className="font-medium text-foreground">
                  Final Details
                </span>{" "}
                — Last month preparations
              </div>
              <div>
                <span className="font-medium text-foreground">Wedding Week</span>{" "}
                — Final rehearsals, confirmations
              </div>
              <div>
                <span className="font-medium text-foreground">Day-of</span> —
                Wedding day coordination
              </div>
              <div>
                <span className="font-medium text-foreground">Completed</span> —
                Post-wedding wrap up
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
