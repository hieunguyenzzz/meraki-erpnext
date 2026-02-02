import { Link } from "react-router";
import { useList } from "@refinedev/core";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";

interface Employee {
  name: string;
  employee_name: string;
  designation: string;
  department: string;
  status: string;
}

const columns: ColumnDef<Employee, unknown>[] = [
  {
    accessorKey: "employee_name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => (
      <Link to={`/hr/employees/${row.original.name}`} className="font-medium text-primary hover:underline">
        {row.original.employee_name}
      </Link>
    ),
    filterFn: "includesString",
  },
  {
    accessorKey: "designation",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Designation" />,
    cell: ({ row }) => row.original.designation || "-",
  },
  {
    accessorKey: "department",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Department" />,
    cell: ({ row }) => row.original.department || "-",
    filterFn: "arrIncludesSome",
  },
  {
    accessorKey: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => (
      <Badge variant={row.original.status === "Active" ? "success" : "secondary"}>
        {row.original.status}
      </Badge>
    ),
    filterFn: "arrIncludesSome",
  },
];

export default function EmployeesPage() {
  const { result, query } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    sorters: [{ field: "employee_name", order: "asc" }],
    meta: { fields: ["name", "employee_name", "designation", "department", "status"] },
  });

  const employees = (result?.data ?? []) as Employee[];
  const isLoading = query.isLoading;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Employees</h1>
        <p className="text-muted-foreground">Manage your team members</p>
      </div>

      <DataTable
        columns={columns}
        data={employees}
        isLoading={isLoading}
        searchKey="employee_name"
        searchPlaceholder="Search employees..."
        filterableColumns={[
          {
            id: "status",
            title: "Status",
            options: [
              { label: "Active", value: "Active" },
              { label: "Inactive", value: "Inactive" },
              { label: "Suspended", value: "Suspended" },
              { label: "Left", value: "Left" },
            ],
          },
          {
            id: "department",
            title: "Department",
            options: [
              { label: "Operations", value: "Operations" },
              { label: "Management", value: "Management" },
              { label: "Administration", value: "Administration" },
            ],
          },
        ]}
      />
    </div>
  );
}
