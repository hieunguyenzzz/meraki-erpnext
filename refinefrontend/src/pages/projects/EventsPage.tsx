import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { type ColumnDef } from "@tanstack/react-table";
import { AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { type FilterableColumn } from "@/components/data-table/data-table-toolbar";
import { StaffFilterSelect } from "@/components/projects/StaffFilterSelect";
import { type StaffOption } from "@/lib/projectKanban";
import { formatDate } from "@/lib/format";
import { useMyEmployee } from "@/hooks/useMyEmployee";
import {
  EVENT_TYPES,
  EVENT_TYPE_COLOR,
  formatTimeRange,
  type StaffEventCount,
  type WeddingEvent,
} from "@/lib/weddingEvents";

function todayIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export default function EventsPage() {
  const [fromDate, setFromDate] = useState(() => todayIso());
  const [toDate, setToDate] = useState(() => todayIso(90));
  const [events, setEvents] = useState<WeddingEvent[]>([]);
  const [staffCounts, setStaffCounts] = useState<StaffEventCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staffFilter, setStaffFilter] = useState("");
  const { employeeId } = useMyEmployee();

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ from: fromDate, to: toDate });
    fetch(`/inquiry-api/wedding-events?${params}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.detail ?? `Failed to load events (${r.status})`);
        }
        return r.json();
      })
      .then((data) => {
        setEvents(data?.events ?? []);
        setStaffCounts(data?.staff_counts ?? []);
      })
      .catch((err) => {
        console.error("[EventsPage] failed to load wedding events", err);
        setEvents([]);
        setStaffCounts([]);
        setError(err instanceof Error ? err.message : "Failed to load events");
      })
      .finally(() => setIsLoading(false));
  }, [fromDate, toDate]);

  const staffOptions: StaffOption[] = useMemo(
    () => staffCounts.map((s) => ({ id: s.employee, name: s.employee_name })),
    [staffCounts]
  );

  const filteredEvents = useMemo(() => {
    if (!staffFilter) return events;
    return events.filter((e) => e.staff.some((s) => s.employee === staffFilter));
  }, [events, staffFilter]);

  const selectedStaffCount = useMemo(
    () => (staffFilter ? staffCounts.find((s) => s.employee === staffFilter) : undefined),
    [staffFilter, staffCounts]
  );

  const weddingTypeOptions = useMemo(() => {
    const set = new Set(events.map((e) => e.wedding_type).filter((t): t is string => Boolean(t)));
    return [...set].sort().map((t) => ({ label: t, value: t }));
  }, [events]);

  const filterableColumns: FilterableColumn[] = useMemo(
    () => [
      {
        id: "event_type",
        title: "Event Type",
        options: EVENT_TYPES.map((t) => ({ label: t, value: t })),
      },
      {
        id: "wedding_type",
        title: "Wedding Type",
        options: weddingTypeOptions,
      },
    ],
    [weddingTypeOptions]
  );

  const columns = useMemo<ColumnDef<WeddingEvent>[]>(
    () => [
      {
        accessorKey: "event_date",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
        cell: ({ row }) => {
          const e = row.original;
          const timeRange = formatTimeRange(e.start_time, e.end_time);
          return (
            <div>
              <div>{formatDate(e.event_date)}</div>
              {timeRange && <div className="text-xs text-muted-foreground">{timeRange}</div>}
            </div>
          );
        },
      },
      {
        accessorKey: "project_name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Wedding" />,
        cell: ({ row }) => (
          <Link to={`/projects/${row.original.project}`} className="font-medium hover:underline">
            {row.original.project_name || row.original.customer || row.original.project}
          </Link>
        ),
      },
      {
        accessorKey: "event_type",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Event Type" />,
        cell: ({ row }) => {
          const type = row.original.event_type;
          return (
            <Badge variant="outline" className={EVENT_TYPE_COLOR[type] ?? ""}>
              {type}
            </Badge>
          );
        },
        filterFn: "arrIncludesSome",
      },
      {
        accessorKey: "wedding_type",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Wedding Type" />,
        cell: ({ row }) =>
          row.original.wedding_type ?? <span className="text-muted-foreground">{"—"}</span>,
        filterFn: "arrIncludesSome",
      },
      {
        id: "venue",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Venue" />,
        cell: ({ row }) => {
          const e = row.original;
          if (!e.venue_name && !e.venue_area) return <span className="text-muted-foreground">{"—"}</span>;
          if (!e.venue_name) return <span>{e.venue_area}</span>;
          return (
            <div>
              <div>{e.venue_name}</div>
              {e.venue_area && <div className="text-xs text-muted-foreground">{e.venue_area}</div>}
            </div>
          );
        },
      },
      {
        accessorKey: "guest_count",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Guests" />,
        cell: ({ row }) =>
          row.original.guest_count ?? <span className="text-muted-foreground">{"—"}</span>,
      },
      {
        id: "staff",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Staff" />,
        cell: ({ row }) => {
          const staff = row.original.staff;
          if (staff.length === 0) return <span className="text-muted-foreground">{"—"}</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {staff.map((s, i) => (
                <Badge
                  key={i}
                  variant="secondary"
                  title={s.role ? `${s.role}${s.call_time ? ` · call ${s.call_time.slice(0, 5)}` : ""}` : undefined}
                >
                  {s.employee_name || s.employee}
                </Badge>
              ))}
            </div>
          );
        },
      },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Wedding Events</h1>
        <p className="text-sm text-muted-foreground">
          Every event across every wedding, with the staff on it. Filter to one person to check their workload.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="h-8"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            className="h-8"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
        {staffOptions.length > 0 && (
          <StaffFilterSelect
            staff={staffOptions}
            value={staffFilter}
            onChange={setStaffFilter}
            myEmployeeId={employeeId ?? undefined}
            allLabel="All staff"
          />
        )}
        {selectedStaffCount && (
          <span className="text-sm text-muted-foreground">
            {selectedStaffCount.employee_name} {"—"} {selectedStaffCount.event_count} event
            {selectedStaffCount.event_count === 1 ? "" : "s"} in range
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <DataTable
        columns={columns}
        data={filteredEvents}
        isLoading={isLoading}
        searchKey="project_name"
        searchPlaceholder="Search wedding..."
        filterableColumns={filterableColumns}
      />
    </div>
  );
}
