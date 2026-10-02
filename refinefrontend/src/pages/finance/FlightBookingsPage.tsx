import { useMemo, useState } from "react";
import { usePermissions } from "@refinedev/core";
import { AlertCircle, RefreshCw } from "lucide-react";
import { FINANCE_ROLES, hasModuleAccess } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/data-table";
import { StaffFilterSelect } from "@/components/projects/StaffFilterSelect";
import { FlightBookingSheet } from "@/components/flights/FlightBookingSheet";
import { SearchableSelect } from "@/components/flights/SearchableSelect";
import { getFlightColumns } from "@/components/flights/flightColumns";
import { formatSyncTime } from "@/components/flights/format";
import { useFlightBookings } from "@/components/flights/useFlightBookings";
import { useFlightLookups } from "@/components/flights/useFlightLookups";
import {
  EMPTY_FILTERS, FLIGHT_STATUSES, type FlightBooking, type FlightFilters,
} from "@/components/flights/types";

const ALL = "__all__";

export default function FlightBookingsPage() {
  const { data: roles } = usePermissions<string[]>({});
  const isFinance = hasModuleAccess(roles ?? [], FINANCE_ROLES);

  const [filters, setFilters] = useState<FlightFilters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<FlightBooking | null>(null);

  const { data, airlines, isLoading, error, refetch, syncing, syncError, syncNotice, startSync } = useFlightBookings(filters);
  const { staff, staffSelectOptions, projectOptions, lookupError } = useFlightLookups();

  const bookings = useMemo(() => data?.bookings ?? [], [data?.bookings]);
  const sync = data?.sync;

  const projectLabels = useMemo(
    () => Object.fromEntries(projectOptions.map((o) => [o.value, o.label])),
    [projectOptions],
  );
  const columns = useMemo(
    () => getFlightColumns((b) => (b.project ? b.project_name || projectLabels[b.project] || b.project : "")),
    [projectLabels],
  );

  const set = <K extends keyof FlightFilters>(key: K, value: FlightFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const hasFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);
  const needsReview = sync?.needs_review_count ?? 0;
  const lastRun = sync?.last_run;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Flight Bookings</h1>
          <p className="text-sm text-muted-foreground">
            {lastRun
              ? `Last sync ${formatSyncTime(lastRun.finished_at ?? lastRun.started_at)} · ${sync?.failed_emails ?? 0} failed · ${sync?.unmatched_emails ?? 0} waiting`
              : "No sync has run yet"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => set("needs_review", !filters.needs_review)}
            aria-pressed={filters.needs_review}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors",
              needsReview > 0
                ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-400"
                : "text-muted-foreground",
              filters.needs_review && "ring-2 ring-amber-400",
            )}
          >
            <AlertCircle className="h-3.5 w-3.5" />
            {needsReview} need review
          </button>
          {isFinance && (
            <Button size="sm" onClick={startSync} disabled={syncing}>
              <RefreshCw className={cn("mr-2 h-4 w-4", syncing && "animate-spin")} />
              {syncing ? "Syncing..." : "Sync now"}
            </Button>
          )}
        </div>
      </div>

      {data?.truncated && (
        <p className="text-sm text-muted-foreground">Showing the first 500 bookings — narrow the filters</p>
      )}
      {syncNotice && <p className="text-sm text-muted-foreground">{syncNotice}</p>}
      {(syncError || error || lookupError) && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
          {[syncError, error, lookupError].filter(Boolean).join(" · ")}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          className="h-8 w-[150px]"
          aria-label="Departure from"
          value={filters.date_from}
          onChange={(e) => set("date_from", e.target.value)}
        />
        <span className="text-sm text-muted-foreground">to</span>
        <Input
          type="date"
          className="h-8 w-[150px]"
          aria-label="Departure to"
          value={filters.date_to}
          onChange={(e) => set("date_to", e.target.value)}
        />
        <Select value={filters.airline || ALL} onValueChange={(v) => set("airline", v === ALL ? "" : v)}>
          <SelectTrigger className="h-8 w-[160px]"><SelectValue placeholder="All airlines" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All airlines</SelectItem>
            {airlines.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <SearchableSelect
          options={projectOptions}
          value={filters.project}
          onChange={(v) => set("project", v)}
          placeholder="All weddings"
          clearLabel="All weddings"
          searchPlaceholder="Search weddings..."
        />
        <StaffFilterSelect
          staff={staff}
          value={filters.employee}
          onChange={(v) => set("employee", v)}
          allLabel="All staff"
        />
        <Select value={filters.status || ALL} onValueChange={(v) => set("status", v === ALL ? "" : v)}>
          <SelectTrigger className="h-8 w-[150px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {FLIGHT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>Clear</Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={bookings}
        isLoading={isLoading}
        searchKey="booking_code"
        searchPlaceholder="Search by booking code..."
        getRowId={(b) => b.name}
        onRowClick={setSelected}
      />

      <FlightBookingSheet
        booking={selected}
        onClose={() => setSelected(null)}
        onChanged={refetch}
        isFinance={isFinance}
        staffOptions={staffSelectOptions}
        projectOptions={projectOptions}
      />
    </div>
  );
}
