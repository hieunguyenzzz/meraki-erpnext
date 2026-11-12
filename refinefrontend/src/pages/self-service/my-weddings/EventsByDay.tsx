import { EventsTimeline, type TimelineEvent } from "@/components/wedding/EventsTimeline";
import { formatIsoWeekday } from "@/lib/format";

/** Every event on a timeline, one block per day (a day heading only when the wedding spans several days). */
export function EventsByDay({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-muted-foreground">No events scheduled yet.</p>;
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? "").localeCompare(b.start ?? ""));
  const days = [...new Set(sorted.map((e) => e.date))];
  return (
    <div className="flex flex-col gap-4">
      {days.map((d) => (
        <div key={d} className="flex flex-col gap-2">
          {days.length > 1 && <h3 className="text-xs font-semibold text-muted-foreground tabular-nums">{formatIsoWeekday(d)}</h3>}
          <EventsTimeline events={sorted.filter((e) => e.date === d)} />
        </div>
      ))}
    </div>
  );
}
