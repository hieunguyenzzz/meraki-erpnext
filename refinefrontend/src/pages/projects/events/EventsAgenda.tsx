import { Link } from "react-router";
import { MapPin, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { dayLabel } from "./range";
import { EventTypeBadge, coupleName, eventTime, staffName, staffTitle, venueText } from "./eventParts";
import type { DayGroup } from "./groupByDay";

/** Phone agenda: sticky day headers, one tappable card per event. */
export function EventsAgenda({ groups }: { groups: DayGroup[] }) {
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => {
        const label = dayLabel(g.date);
        return (
          <section key={g.date} aria-label={`${label.main} ${label.date ?? ""}`}>
            <h2 className="sticky top-0 z-10 -mx-4 mb-2 bg-background px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {label.main}
              {label.date && <span className="ml-2 font-medium normal-case tracking-normal">{label.date}</span>}
            </h2>
            <ul className="flex flex-col gap-2.5">
              {g.events.map((e) => {
                const venue = venueText(e);
                return (
                  <li key={e.name}>
                    <Link
                      to={`/projects/${e.project}`}
                      className="flex flex-col gap-2 rounded-card border bg-card p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-lg font-bold tabular-nums">{eventTime(e)}</span>
                        <EventTypeBadge type={e.event_type} />
                      </div>
                      <span className="break-words font-display text-[24px] font-semibold leading-6 lining-nums">{coupleName(e)}</span>
                      {venue && (
                        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          <span className="min-w-0">{venue}</span>
                        </span>
                      )}
                      {e.guest_count != null && (
                        <span className="flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums">
                          <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          {e.guest_count} guests
                        </span>
                      )}
                      {e.staff.length > 0 && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t pt-2 text-xs text-muted-foreground">
                          {e.staff.map((s, i) => (
                            <span key={`${s.employee}-${i}`} title={staffTitle(s)}>
                              {staffName(s)}
                              {s.role && <span className="opacity-70"> · {s.role}</span>}
                            </span>
                          ))}
                        </div>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function EventsAgendaSkeleton() {
  return (
    <div className="flex flex-col gap-2.5" aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2.5 rounded-card border bg-card p-4">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-6 w-3/5" />
          <Skeleton className="h-3.5 w-1/2" />
        </div>
      ))}
    </div>
  );
}
