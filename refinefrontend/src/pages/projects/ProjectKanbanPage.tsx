import { useMemo, useState } from "react";
import { useList } from "@refinedev/core";
import { Plus } from "lucide-react";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { ProjectKanbanCard } from "@/components/projects/ProjectKanbanCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  PROJECT_COLUMNS,
  getProjectColumnKey,
  type ProjectKanbanItem,
} from "@/lib/projectKanban";
import { CreateWeddingDialog } from "./CreateWeddingDialog";

export default function ProjectKanbanPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

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

  // Fetch Sales Orders for venue info
  const { result: salesOrdersResult } = useList({
    resource: "Sales Order",
    pagination: { mode: "off" },
    filters: [{ field: "docstatus", operator: "eq", value: 1 }],
    meta: {
      fields: ["name", "customer_name", "custom_venue"],
    },
  });

  // Fetch Employees for planner names
  const { result: employeesResult } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "eq", value: "Active" }],
    meta: { fields: ["name", "employee_name"] },
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
        venue_name: linkedSO?.custom_venue,
        lead_planner_name: p.custom_lead_planner ? employeeByName.get(p.custom_lead_planner) : undefined,
        support_planner_name: p.custom_support_planner ? employeeByName.get(p.custom_support_planner) : undefined,
      };
    });
  }, [projectsResult, salesOrdersResult, customersResult, employeesResult]);

  const isLoading = projectsQuery?.isLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Weddings</h1>
          <p className="text-sm text-muted-foreground">
            Manage wedding projects by stage
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Wedding
        </Button>
      </div>

      <CreateWeddingDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      {isLoading ? (
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
            items={items}
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
