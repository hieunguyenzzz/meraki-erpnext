import { useList } from "@refinedev/core";
import type { ColumnDef } from "@tanstack/react-table";
import { formatVND, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";

interface JournalEntry {
  name: string;
  posting_date: string;
  voucher_type: string;
  total_debit: number;
  total_credit: number;
  user_remark: string;
  docstatus: number;
}

const columns: ColumnDef<JournalEntry, unknown>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    filterFn: "includesString",
  },
  {
    accessorKey: "posting_date",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    cell: ({ row }) => formatDate(row.original.posting_date),
  },
  {
    accessorKey: "voucher_type",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
    filterFn: "arrIncludesSome",
  },
  {
    accessorKey: "total_debit",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Debit" className="text-right" />,
    cell: ({ row }) => <div className="text-right">{formatVND(row.original.total_debit)}</div>,
  },
  {
    accessorKey: "total_credit",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Credit" className="text-right" />,
    cell: ({ row }) => <div className="text-right">{formatVND(row.original.total_credit)}</div>,
  },
  {
    accessorKey: "docstatus",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => (
      <Badge variant={row.original.docstatus === 1 ? "success" : "secondary"}>
        {row.original.docstatus === 1 ? "Submitted" : "Draft"}
      </Badge>
    ),
  },
  {
    accessorKey: "user_remark",
    header: "Remark",
    cell: ({ row }) => (
      <span className="max-w-[200px] truncate block">{row.original.user_remark || "-"}</span>
    ),
    enableSorting: false,
  },
];

export default function JournalsPage() {
  const { result, query } = useList({
    resource: "Journal Entry",
    pagination: { mode: "off" },
    sorters: [{ field: "posting_date", order: "desc" }],
    meta: { fields: ["name", "posting_date", "voucher_type", "total_debit", "total_credit", "user_remark", "docstatus"] },
  });

  const journals = (result?.data ?? []) as JournalEntry[];
  const isLoading = query.isLoading;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Journal Entries</h1>
        <p className="text-muted-foreground">Manual accounting entries and adjustments</p>
      </div>

      <DataTable
        columns={columns}
        data={journals}
        isLoading={isLoading}
        searchKey="name"
        searchPlaceholder="Search entries..."
        filterableColumns={[
          {
            id: "voucher_type",
            title: "Type",
            options: [
              { label: "Journal Entry", value: "Journal Entry" },
              { label: "Bank Entry", value: "Bank Entry" },
              { label: "Cash Entry", value: "Cash Entry" },
            ],
          },
        ]}
      />
    </div>
  );
}
