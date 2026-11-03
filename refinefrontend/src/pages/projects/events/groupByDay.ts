import type { WeddingEvent } from "@/lib/weddingEvents";

export interface DayGroup {
  date: string;
  events: WeddingEvent[];
}

/** Events sorted by date then start time, grouped per calendar day. */
export function groupByDay(events: WeddingEvent[]): DayGroup[] {
  const sorted = [...events].sort(
    (a, b) => a.event_date.localeCompare(b.event_date) || (a.start_time ?? "").localeCompare(b.start_time ?? "")
  );
  const groups: DayGroup[] = [];
  for (const e of sorted) {
    const date = e.event_date.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.date === date) last.events.push(e);
    else groups.push({ date, events: [e] });
  }
  return groups;
}
