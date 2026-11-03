import { useEffect, useMemo, useState } from "react";
import { parseAsString, useQueryStates } from "nuqs";
import { CalendarX, RotateCw } from "lucide-react";
import { useMyEmployee } from "@/hooks/useMyEmployee";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { type StaffOption } from "@/lib/projectKanban";
import { EVENT_TYPES } from "@/lib/weddingEvents";
import { StatePanel } from "./weddings-list/StatePanel";
import { EventFilters } from "./events/EventFilters";
import { EventsAgenda, EventsAgendaSkeleton } from "./events/EventsAgenda";
import { EventsTable, EventsTableSkeleton } from "./events/EventsTable";
import { groupByDay } from "./events/groupByDay";
import { pastRange, shiftRange, upcomingRange, type DateRange } from "./events/range";
import { useWeddingEvents } from "./events/useWeddingEvents";

export default function EventsPage() {
  // Window and filters live in the URL so Back from a wedding returns to the same view.
  const defaults = useMemo(() => upcomingRange(), []);
  const [params, setParams] = useQueryStates(
    {
      from: parseAsString.withDefault(defaults.from),
      to: parseAsString.withDefault(defaults.to),
      q: parseAsString.withDefault(""),
      type: parseAsString.withDefault(""),
      wtype: parseAsString.withDefault(""),
      staff: parseAsString.withDefault(""),
    },
    { clearOnDefault: true }
  );
  const { q: query, type: eventType, wtype: weddingType, staff: staffFilter } = params;
  // A reversed range (typed or from the URL) is swapped rather than sent to the backend.
  const range = useMemo<DateRange>(
    () => (params.from > params.to ? { from: params.to, to: params.from } : { from: params.from, to: params.to }),
    [params.from, params.to]
  );
  const setRange = (r: DateRange | ((prev: DateRange) => DateRange)) => {
    const next = typeof r === "function" ? r(range) : r;
    return setParams({ from: next.from, to: next.to });
  };
  const setQuery = (v: string) => setParams({ q: v });
  const setEventType = (v: string) => setParams({ type: v });
  const setWeddingType = (v: string) => setParams({ wtype: v });
  const setStaffFilter = (v: string) => setParams({ staff: v });
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { employee, employeeId } = useMyEmployee();
  const { events, staffCounts, isLoading, error, reload } = useWeddingEvents(range.from, range.to);

  const mode = useMemo(() => {
    const up = upcomingRange();
    const past = pastRange();
    if (range.from === up.from && range.to === up.to) return "upcoming" as const;
    if (range.from === past.from && range.to === past.to) return "past" as const;
    return "custom" as const;
  }, [range]);

  // Show the skeleton only after 300 ms so quick loads don't flash.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), 300);
    return () => clearTimeout(t);
  }, [isLoading]);

  const staffOptions: StaffOption[] = useMemo(() => {
    const options = staffCounts.map((s) => ({ id: s.employee, name: s.employee_name }));
    // "Only my events" must show my name even when I'm on no event in this window.
    if (employeeId && !options.some((o) => o.id === employeeId)) {
      options.push({ id: employeeId, name: employee?.employee_name || employeeId });
    }
    return options;
  }, [staffCounts, employeeId, employee]);

  const eventTypes = useMemo(() => {
    const present = new Set(events.map((e) => e.event_type));
    if (eventType) present.add(eventType);
    const known = EVENT_TYPES.filter((t) => present.has(t)) as string[];
    const extra = [...present].filter((t) => !(EVENT_TYPES as readonly string[]).includes(t)).sort();
    return [...known, ...extra];
  }, [events, eventType]);

  const weddingTypes = useMemo(
    () => [...new Set(events.map((e) => e.wedding_type).filter((t): t is string => Boolean(t)))].sort(),
    [events]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter(
      (e) =>
        (!staffFilter || e.staff.some((s) => s.employee === staffFilter)) &&
        (!eventType || e.event_type === eventType) &&
        (!weddingType || e.wedding_type === weddingType) &&
        (!q || (e.project_name ?? "").toLowerCase().includes(q) || (e.customer ?? "").toLowerCase().includes(q))
    );
  }, [events, staffFilter, eventType, weddingType, query]);

  const groups = useMemo(() => groupByDay(filtered), [filtered]);
  const isFiltered = Boolean(query || eventType || weddingType || staffFilter);
  const selectedStaffCount = staffFilter ? staffCounts.find((s) => s.employee === staffFilter) : undefined;

  let body;
  if (error) {
    body = (
      <StatePanel
        kind="error"
        title="Couldn't load events"
        text={error}
        action={{ label: "Try again", onClick: reload, icon: <RotateCw className="h-4 w-4" /> }}
      />
    );
  } else if (isLoading) {
    body = !slow ? null : isDesktop ? <EventsTableSkeleton /> : <EventsAgendaSkeleton />;
  } else if (groups.length === 0) {
    body = (
      <StatePanel
        kind="empty"
        title={isFiltered ? "No events match" : "No events in this window"}
        text={isFiltered ? "Try a different type, person or search." : "Pick another date range to see more."}
        action={isFiltered ? undefined : { label: "Show upcoming", onClick: () => setRange(upcomingRange()), icon: <CalendarX className="h-4 w-4" /> }}
      />
    );
  } else {
    body = isDesktop ? <EventsTable groups={groups} /> : <EventsAgenda groups={groups} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold leading-tight md:font-display md:text-4xl md:leading-10">Events</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every event across every wedding, with the staff on it.
          {selectedStaffCount && (
            <>
              {" "}
              {selectedStaffCount.employee_name} {"—"} {selectedStaffCount.event_count} event
              {selectedStaffCount.event_count === 1 ? "" : "s"} in range.
            </>
          )}
        </p>
      </header>

      <EventFilters
        range={range}
        onRange={setRange}
        onShift={(d) => setRange((r) => shiftRange(r, d))}
        mode={mode}
        onMode={(m) => setRange(m === "upcoming" ? upcomingRange() : pastRange())}
        query={query}
        onQuery={setQuery}
        eventTypes={eventTypes}
        eventType={eventType}
        onEventType={setEventType}
        weddingTypes={weddingTypes}
        weddingType={weddingType}
        onWeddingType={setWeddingType}
        staffOptions={staffOptions}
        staff={staffFilter}
        onStaff={setStaffFilter}
        myEmployeeId={employeeId ?? undefined}
      />

      {body}
    </div>
  );
}
