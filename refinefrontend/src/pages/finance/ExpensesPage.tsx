import { Link } from "react-router";
import { useList } from "@refinedev/core";
import type { ColumnDef } from "@tanstack/react-table";
import { formatVND, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";

interface Expense {
  name: string;
  supplier: string;
  supplier_name: string;
  posting_date: string;
  grand_total: number;
  outstanding_amount: number;
  status: string;
}

function statusVariant(status: string) {
  if (status === "Paid") return "success" as const;
  if (status === "Overdue" || status === "Cancelled") return "destructive" as const;
  return "warning" as const;
}

const columns: ColumnDef<Expense, unknown>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => (
      <Link to={`/finance/expenses/${row.original.name}`} className="font-medium text-primary hover:underline">
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "supplier_name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Supplier" />,
    cell: ({ row }) => row.original.supplier_name || row.original.supplier,
    filterFn: "includesString",
  },
  {
    accessorKey: "posting_date",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    cell: ({ row }) => formatDate(row.original.posting_date),
  },
  {
    accessorKey: "grand_total",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Total" className="text-right" />,
    cell: ({ row }) => <div className="text-right">{formatVND(row.original.grand_total)}</div>,
  },
  {
    accessorKey: "outstanding_amount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Outstanding" className="text-right" />,
    cell: ({ row }) => <div className="text-right">{formatVND(row.original.outstanding_amount)}</div>,
  },
  {
    accessorKey: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => (
      <Badge variant={statusVariant(row.original.status)}>
        {row.original.status}
      </Badge>
    ),
    filterFn: "arrIncludesSome",
  },
];

export default function ExpensesPage() {
  const { result, query } = useList({
    resource: "Purchase Invoice",
    pagination: { mode: "off" },
    sorters: [{ field: "posting_date", order: "desc" }],
    meta: {
      fields: [
        "name", "supplier", "supplier_name", "posting_date",
        "grand_total", "outstanding_amount", "status",
      ],
    },
  });

  const expenses = (result?.data ?? []) as Expense[];
  const isLoading = query.isLoading;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
        <p className="text-muted-foreground">Purchase invoices and supplier billing</p>
      </div>

      <DataTable
        columns={columns}
        data={expenses}
        isLoading={isLoading}
        searchKey="supplier_name"
        searchPlaceholder="Search by supplier..."
        filterableColumns={[
          {
            id: "status",
            title: "Status",
            options: [
              { label: "Paid", value: "Paid" },
              { label: "Unpaid", value: "Unpaid" },
              { label: "Overdue", value: "Overdue" },
              { label: "Cancelled", value: "Cancelled" },
            ],
          },
        ]}
      />
    </div>
  );
}
