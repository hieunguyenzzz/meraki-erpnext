import { useState } from "react";
import { useList, useInvalidate } from "@refinedev/core";
import type { ColumnDef } from "@tanstack/react-table";
import { formatVND, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";
import { Trash2 } from "lucide-react";

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
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
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
  const invalidate = useInvalidate();
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { result, query } = useList({
    resource: "Journal Entry",
    pagination: { mode: "off" },
    sorters: [{ field: "posting_date", order: "desc" }],
    meta: { fields: ["name", "posting_date", "voucher_type", "total_debit", "total_credit", "user_remark", "docstatus"] },
  });

  const journals = (result?.data ?? []) as JournalEntry[];
  const isLoading = query.isLoading;

  const selectedNames = Object.keys(rowSelection).filter((k) => rowSelection[k]);
  const selectedCount = selectedNames.length;

  async function handleDelete() {
    if (selectedCount === 0) return;
    if (!confirm(`Delete ${selectedCount} journal ${selectedCount === 1 ? "entry" : "entries"}? Submitted entries will be cancelled first.`)) return;

    setDeleting(true);
    setError(null);
    try {
      // selectedNames are row indices — map to actual JE names
      const names = selectedNames.map((idx) => journals[Number(idx)]?.name).filter(Boolean);
      const res = await fetch("/inquiry-api/journal-entries/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Delete failed: ${res.status}`);
      }
      const data = await res.json();
      if (data.failed?.length) {
        setError(`Some entries failed: ${data.failed.join(", ")}`);
      }
      setRowSelection({});
      invalidate({ resource: "Journal Entry", invalidates: ["list"] });
    } catch (err: any) {
      setError(err.message || "Failed to delete entries");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Journal Entries</h1>
          <p className="text-muted-foreground">Manual accounting entries and adjustments</p>
        </div>
        {selectedCount > 0 && (
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
            <Trash2 className="mr-1.5 h-4 w-4" />
            {deleting ? "Deleting..." : `Delete ${selectedCount} selected`}
          </Button>
        )}
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-4 font-medium hover:text-red-900">&times;</button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={journals}
        isLoading={isLoading}
        searchKey="name"
        searchPlaceholder="Search entries..."
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
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
