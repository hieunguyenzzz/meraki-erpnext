import type { ColumnDef } from "@tanstack/react-table";
import { AlertCircle } from "lucide-react";
import { DataTableColumnHeader } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { formatAmount, formatDateTime24 } from "./format";
import type { FlightBooking, FlightStatus } from "./types";

type BadgeVariant = "success" | "info" | "destructive" | "secondary";

export const STATUS_VARIANT: Record<FlightStatus, BadgeVariant> = {
  Confirmed: "success",
  Changed: "info",
  Cancelled: "destructive",
  Refunded: "secondary",
};

const UNMATCHED_PILL =
  "inline-flex items-center rounded-full border border-transparent bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-400";

const dash = <span className="text-muted-foreground">—</span>;

export function getFlightColumns(projectLabel: (b: FlightBooking) => string): ColumnDef<FlightBooking, unknown>[] {
  return [
    {
      accessorKey: "first_departure",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Departure" />,
      cell: ({ row }) => <span className="whitespace-nowrap">{formatDateTime24(row.original.first_departure)}</span>,
    },
    {
      accessorKey: "booking_code",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.booking_code}</span>,
    },
    {
      accessorKey: "airline",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Airline" />,
    },
    {
      accessorKey: "route",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      cell: ({ row }) => <span className="whitespace-nowrap">{row.original.route || "-"}</span>,
    },
    {
      id: "flights",
      header: "Flights",
      cell: ({ row }) => {
        const nos = (row.original.segments ?? []).map((s) => s.flight_no).filter(Boolean);
        return nos.length ? <span className="font-mono text-xs">{nos.join(", ")}</span> : dash;
      },
      enableSorting: false,
    },
    {
      accessorKey: "qty",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Qty" className="text-right" />,
      cell: ({ row }) => <div className="text-right">{row.original.qty}</div>,
    },
    {
      id: "staff",
      header: "Staff",
      cell: ({ row }) => {
        const pax = row.original.passengers ?? [];
        if (!pax.length) return dash;
        return (
          <div className="flex flex-wrap gap-1">
            {pax.map((p) =>
              p.employee ? (
                <Badge key={p.name} variant="secondary">{p.employee_name || p.employee}</Badge>
              ) : (
                <span key={p.name} className={UNMATCHED_PILL} title={p.passenger_name}>unmatched</span>
              ),
            )}
          </div>
        );
      },
      enableSorting: false,
    },
    {
      accessorKey: "total_amount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total" className="text-right" />,
      cell: ({ row }) => (
        <div className="text-right whitespace-nowrap">{formatAmount(row.original.total_amount, row.original.currency)}</div>
      ),
    },
    {
      id: "wedding",
      header: "Wedding",
      cell: ({ row }) => {
        const label = projectLabel(row.original);
        return label ? <span>{label}</span> : dash;
      },
      enableSorting: false,
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status] ?? "secondary"}>{row.original.status}</Badge>
      ),
    },
    {
      id: "review",
      header: "",
      cell: ({ row }) =>
        row.original.needs_review ? (
          <AlertCircle className="h-4 w-4 text-amber-500" aria-label="Needs review" />
        ) : null,
      enableSorting: false,
    },
  ];
}
