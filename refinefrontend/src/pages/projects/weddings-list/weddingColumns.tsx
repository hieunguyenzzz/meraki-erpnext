import { useMemo } from "react";
import { Link } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { PlannerCell, type PlannerEmployee } from "@/components/projects/PlannerCell";
import type { ProjectKanbanItem } from "@/lib/projectKanban";
import { Countdown, Dash, Money, PaidBadge, StageBadge, TaxBadge, TypeBadge } from "./WeddingBadges";

interface Options {
  isFinance: boolean;
  canEditPlanners: boolean;
  employees: PlannerEmployee[];
  onPlannerUpdated: (projectId: string, field: string, newId: string | null, newName: string) => void;
}

type Col = ColumnDef<ProjectKanbanItem>;

type HeaderFn = NonNullable<Col["header"]>;

const header = (title: string): HeaderFn => ({ column }) => <DataTableColumnHeader column={column} title={title} />;

const rightHeader = (title: string): HeaderFn => ({ column }) => (
  <div className="flex justify-end">
    <DataTableColumnHeader column={column} title={title} className="-mr-3 ml-0" />
  </div>
);

export function useWeddingColumns({ isFinance, canEditPlanners, employees, onPlannerUpdated }: Options): Col[] {
  return useMemo(() => {
    const planner = (idField: keyof ProjectKanbanItem, nameField: keyof ProjectKanbanItem, title: string): Col => ({
      accessorKey: nameField,
      header: header(title),
      cell: ({ row }) => {
        const item = row.original;
        const name = item[nameField] as string | undefined;
        if (!canEditPlanners) return name ?? <Dash />;
        return (
          <PlannerCell
            projectId={item.id}
            field={idField}
            currentId={item[idField] as string | undefined}
            currentName={name}
            employees={employees}
            onUpdated={onPlannerUpdated}
          />
        );
      },
    });

    const cols: Col[] = [
      {
        accessorKey: "customer_name",
        header: header("Couple"),
        cell: ({ row }) => (
          <Link to={`/projects/${row.original.id}`} className="font-semibold hover:underline">
            {row.original.customer_name || row.original.project_name}
          </Link>
        ),
      },
      {
        accessorKey: "expected_end_date",
        header: header("Wedding date"),
        cell: ({ row }) => {
          const date = row.original.expected_end_date;
          if (!date) return <Dash />;
          return (
            <span className="flex items-center gap-2 tabular-nums">
              {date.slice(0, 10)}
              <Countdown date={date} />
            </span>
          );
        },
      },
      {
        accessorKey: "custom_project_stage",
        header: header("Stage"),
        cell: ({ row }) => <StageBadge stage={row.original.custom_project_stage} />,
      },
      {
        accessorKey: "venue_name",
        header: header("Venue"),
        cell: ({ row }) => row.original.venue_name ?? <Dash />,
      },
      {
        accessorKey: "custom_wedding_type",
        header: header("Type"),
        cell: ({ row }) => <TypeBadge type={row.original.custom_wedding_type} />,
      },
      planner("custom_lead_planner", "lead_planner_name", "Lead planner"),
      planner("custom_support_planner", "support_planner_name", "2nd planner"),
      planner("custom_assistant_1", "assistant_1_name", "Assistant 1"),
      planner("custom_assistant_2", "assistant_2_name", "Assistant 2"),
      planner("custom_assistant_3", "assistant_3_name", "Support"),
    ];

    if (isFinance) {
      cols.push(
        {
          accessorKey: "custom_service_type",
          header: header("Package"),
          cell: ({ row }) => {
            const type = row.original.custom_service_type;
            if (!type) return <Dash />;
            return <Badge variant={type.toLowerCase().includes("full") ? "default" : "secondary"}>{type}</Badge>;
          },
        },
        {
          accessorKey: "package_amount",
          header: rightHeader("Amount"),
          cell: ({ row }) => <div className="text-right"><Money amount={row.original.package_amount} /></div>,
        },
        {
          accessorKey: "tax_type",
          header: header("Tax"),
          cell: ({ row }) => <TaxBadge type={row.original.tax_type} />,
        },
        {
          accessorKey: "commission_base",
          header: rightHeader("Commission base"),
          cell: ({ row }) => <div className="text-right"><Money amount={row.original.commission_base} /></div>,
        },
        {
          accessorKey: "per_billed",
          header: header("Paid"),
          cell: ({ row }) => <PaidBadge percent={row.original.per_billed} />,
        },
      );
    }

    cols.push({
      id: "actions",
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/projects/${row.original.id}`}>View {"→"}</Link>
        </Button>
      ),
    });
    return cols;
  }, [isFinance, canEditPlanners, employees, onPlannerUpdated]);
}
