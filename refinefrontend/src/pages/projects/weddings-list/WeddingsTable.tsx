import { useState } from "react";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import type { ProjectKanbanItem } from "@/lib/projectKanban";
import { cn } from "@/lib/utils";

const STICKY_COL = "customer_name";

/** Desktop list: sticky header, sticky Couple column, sortable columns, 30 rows a page. */
export function WeddingsTable({ data, columns }: { data: ProjectKanbanItem[]; columns: ColumnDef<ProjectKanbanItem>[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data,
    columns,
    getRowId: (r) => r.id,
    state: { sorting },
    onSortingChange: setSorting,
    initialState: { pagination: { pageSize: 30 } },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="flex flex-col gap-2">
      {/* The wrapper scrolls both ways so the header can stick to its top edge. */}
      <div className="max-h-[calc(100dvh-22rem)] min-h-[20rem] overflow-auto rounded-card border bg-card">
        <table className="w-full min-w-max caption-bottom text-sm tabular-nums">
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-secondary">
                {hg.headers.map((h) => (
                  <TableHead
                    key={h.id}
                    aria-sort={
                      h.column.getIsSorted() === "asc" ? "ascending" : h.column.getIsSorted() === "desc" ? "descending" : undefined
                    }
                    className={cn(
                      "sticky top-0 z-20 h-11 whitespace-nowrap bg-secondary px-4 text-[13px]",
                      h.column.id === STICKY_COL && "left-0 z-30"
                    )}
                  >
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="group">
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      "whitespace-nowrap px-4 py-3",
                      cell.column.id === STICKY_COL && "sticky left-0 z-10 bg-card group-hover:bg-secondary"
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </table>
      </div>
      <DataTablePagination table={table} />
    </div>
  );
}

export function WeddingsTableSkeleton() {
  return (
    <div className="rounded-card border bg-card" aria-busy="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-6 border-b p-4 last:border-b-0">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}
