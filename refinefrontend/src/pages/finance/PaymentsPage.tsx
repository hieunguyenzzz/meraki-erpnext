import { Link } from "react-router";
import { useList } from "@refinedev/core";
import type { ColumnDef } from "@tanstack/react-table";
import { formatVND, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";

interface Payment {
  name: string;
  payment_type: string;
  party: string;
  party_name: string;
  posting_date: string;
  paid_amount: number;
  mode_of_payment: string;
  reference_no: string;
  docstatus: number;
}

function statusVariant(docstatus: number) {
  if (docstatus === 1) return "success" as const;
  if (docstatus === 2) return "destructive" as const;
  return "secondary" as const;
}

function statusLabel(docstatus: number) {
  if (docstatus === 1) return "Submitted";
  if (docstatus === 2) return "Cancelled";
  return "Draft";
}

const columns: ColumnDef<Payment, unknown>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => (
      <Link to={`/finance/payments/${row.original.name}`} className="font-medium text-primary hover:underline">
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "payment_type",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
    cell: ({ row }) => (
      <Badge variant={row.original.payment_type === "Receive" ? "success" : "warning"}>
        {row.original.payment_type}
      </Badge>
    ),
    filterFn: "arrIncludesSome",
  },
  {
    accessorKey: "party_name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Party" />,
    cell: ({ row }) => row.original.party_name || row.original.party,
    filterFn: "includesString",
  },
  {
    accessorKey: "posting_date",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    cell: ({ row }) => formatDate(row.original.posting_date),
  },
  {
    accessorKey: "paid_amount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" className="text-right" />,
    cell: ({ row }) => <div className="text-right">{formatVND(row.original.paid_amount)}</div>,
  },
  {
    accessorKey: "mode_of_payment",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Mode" />,
    cell: ({ row }) => row.original.mode_of_payment || "-",
  },
  {
    accessorKey: "reference_no",
    header: "Ref #",
    cell: ({ row }) => row.original.reference_no || "-",
    enableSorting: false,
  },
  {
    accessorKey: "docstatus",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => (
      <Badge variant={statusVariant(row.original.docstatus)}>
        {statusLabel(row.original.docstatus)}
      </Badge>
    ),
  },
];

export default function PaymentsPage() {
  const { result, query } = useList({
    resource: "Payment Entry",
    pagination: { mode: "off" },
    sorters: [{ field: "posting_date", order: "desc" }],
    meta: {
      fields: [
        "name", "payment_type", "party", "party_name", "posting_date",
        "paid_amount", "mode_of_payment", "reference_no", "docstatus",
      ],
    },
  });

  const payments = (result?.data ?? []) as Payment[];
  const isLoading = query.isLoading;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
        <p className="text-muted-foreground">Track payment entries</p>
      </div>

      <DataTable
        columns={columns}
        data={payments}
        isLoading={isLoading}
        searchKey="party_name"
        searchPlaceholder="Search by party..."
        filterableColumns={[
          {
            id: "payment_type",
            title: "Type",
            options: [
              { label: "Receive", value: "Receive" },
              { label: "Pay", value: "Pay" },
              { label: "Internal Transfer", value: "Internal Transfer" },
            ],
          },
        ]}
      />
    </div>
  );
}
