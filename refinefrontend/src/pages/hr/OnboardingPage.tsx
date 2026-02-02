import { Link } from "react-router";
import { useList } from "@refinedev/core";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";

interface Onboarding {
  name: string;
  employee_name: string;
  boarding_status: string;
  department: string;
  designation: string;
}

function statusVariant(status: string) {
  switch (status) {
    case "Completed": return "success" as const;
    case "In Process": return "default" as const;
    default: return "secondary" as const;
  }
}

const columns: ColumnDef<Onboarding, unknown>[] = [
  {
    accessorKey: "employee_name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Employee" />,
    cell: ({ row }) => (
      <Link to={`/hr/onboarding/${row.original.name}`} className="font-medium text-primary hover:underline">
        {row.original.employee_name}
      </Link>
    ),
    filterFn: "includesString",
  },
  {
    accessorKey: "department",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Department" />,
    cell: ({ row }) => row.original.department || "-",
  },
  {
    accessorKey: "designation",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Designation" />,
    cell: ({ row }) => row.original.designation || "-",
  },
  {
    accessorKey: "boarding_status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => (
      <Badge variant={statusVariant(row.original.boarding_status)}>
        {row.original.boarding_status}
      </Badge>
    ),
    filterFn: "arrIncludesSome",
  },
];

export default function OnboardingPage() {
  const { result, query } = useList({
    resource: "Employee Onboarding",
    pagination: { mode: "off" },
    sorters: [{ field: "creation", order: "desc" }],
    meta: { fields: ["name", "employee_name", "boarding_status", "department", "designation"] },
  });

  const onboardings = (result?.data ?? []) as Onboarding[];
  const isLoading = query.isLoading;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Onboarding</h1>
        <p className="text-muted-foreground">Track employee onboarding progress</p>
      </div>

      <DataTable
        columns={columns}
        data={onboardings}
        isLoading={isLoading}
        searchKey="employee_name"
        searchPlaceholder="Search by employee..."
        filterableColumns={[
          {
            id: "boarding_status",
            title: "Status",
            options: [
              { label: "Pending", value: "Pending" },
              { label: "In Process", value: "In Process" },
              { label: "Completed", value: "Completed" },
            ],
          },
        ]}
      />
    </div>
  );
}
