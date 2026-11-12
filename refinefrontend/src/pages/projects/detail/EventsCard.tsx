import { SectionCard } from "@/components/wedding/SectionCard";
import type { WeddingEvent } from "@/lib/weddingEvents";

/** Next few events with a link to the full Events tab. */
export function EventsCard({ events, onOpenAll }: { events: WeddingEvent[]; onOpenAll: () => void }) {
  const sorted = [...events].sort((a, b) => a.event_date.localeCompare(b.event_date) || (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  return (
    <SectionCard
      title="Events"
      action={
        <button type="button" onClick={onOpenAll} className="text-sm font-semibold text-primary hover:underline">
          All {events.length}
        </button>
      }
    >
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events recorded yet.</p>
      ) : (
        <ul className="grid grid-cols-[84px_1fr_auto] items-center gap-x-3 gap-y-3 text-sm">
          {sorted.slice(0, 4).map((e) => (
            <li key={e.name} className="col-span-3 grid grid-cols-subgrid items-center">
              <b className="tabular-nums">
                <span className="block text-xs font-normal text-muted-foreground">{e.event_date}</span>
                {e.start_time ? e.start_time.slice(0, 5) : "--:--"}
              </b>
              <span>
                {e.event_type}
                <span className="block text-muted-foreground">{[e.venue_area, e.guest_count ? String(e.guest_count) : null].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="text-muted-foreground">{e.staff.length ? `${e.staff.length} staff` : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
