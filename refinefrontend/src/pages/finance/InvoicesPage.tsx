import { Link } from "react-router";
import { useList } from "@refinedev/core";
import type { ColumnDef } from "@tanstack/react-table";
import { formatVND, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";

interface Invoice {
  name: string;
  customer: string;
  customer_name: string;
  posting_date: string;
  grand_total: number;
  outstanding_amount: number;
  status: string;
}

const columns: ColumnDef<Invoice, unknown>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Invoice" />,
    cell: ({ row }) => (
      <Link to={`/finance/invoices/${row.original.name}`} className="font-medium text-primary hover:underline">
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "customer_name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />,
    cell: ({ row }) => row.original.customer_name,
    filterFn: "includesString",
  },
  {
    accessorKey: "posting_date",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    cell: ({ row }) => formatDate(row.original.posting_date),
  },
  {
    accessorKey: "grand_total",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" className="text-right" />,
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
      <Badge variant={row.original.status === "Paid" ? "success" : row.original.status === "Overdue" ? "destructive" : "warning"}>
        {row.original.status}
      </Badge>
    ),
    filterFn: "arrIncludesSome",
  },
];

export default function InvoicesPage() {
  const { result, query } = useList({
    resource: "Sales Invoice",
    pagination: { mode: "off" },
    sorters: [{ field: "posting_date", order: "desc" }],
    meta: { fields: ["name", "customer", "customer_name", "posting_date", "grand_total", "outstanding_amount", "status"] },
  });

  const invoices = (result?.data ?? []) as Invoice[];
  const isLoading = query.isLoading;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sales Invoices</h1>
        <p className="text-muted-foreground">Track revenue and customer billing</p>
      </div>

      <DataTable
        columns={columns}
        data={invoices}
        isLoading={isLoading}
        searchKey="customer_name"
        searchPlaceholder="Search by customer..."
        filterableColumns={[
          {
            id: "status",
            title: "Status",
            options: [
              { label: "Paid", value: "Paid" },
              { label: "Unpaid", value: "Unpaid" },
              { label: "Overdue", value: "Overdue" },
              { label: "Cancelled", value: "Cancelled" },
              { label: "Return", value: "Return" },
            ],
          },
        ]}
      />
    </div>
  );
}
