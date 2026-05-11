import { useState, useEffect } from "react";
import { Link } from "react-router";
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
  docstatus: number;
  description: string;
  category: string;
  linked_invoice: string;
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
    accessorKey: "description",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
    cell: ({ row }) => {
      const { description, category } = row.original;
      if (!description) return <span className="text-muted-foreground">—</span>;
      return (
        <span>
          {description}
          {category && <span className="text-muted-foreground ml-1">({category})</span>}
        </span>
      );
    },
  },
];

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/inquiry-api/payments")
      .then((r) => r.json())
      .then((data) => setPayments(Array.isArray(data) ? data : []))
      .catch(() => setPayments([]))
      .finally(() => setIsLoading(false));
  }, []);

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
