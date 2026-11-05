import { nowTimeVN, todayVN } from "@/lib/businessTime";
import { cn } from "@/lib/utils";

export interface TimelineEvent {
  key: string;
  title: string;
  date: string;
  start: string | null;
  end: string | null;
  place?: string | null;
  guests?: number | null;
  staff?: string[];
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

function byTime(a: TimelineEvent, b: TimelineEvent) {
  return a.date.localeCompare(b.date) || hhmm(a.start).localeCompare(hhmm(b.start));
}

/** Today's events if there are any, otherwise the next day that has events (nothing once the wedding is over). */
export function pickGlanceEvents(events: TimelineEvent[], today: string = todayVN()): { heading: string; items: TimelineEvent[] } | null {
  const sorted = [...events].sort(byTime);
  const todays = sorted.filter((e) => e.date === today);
  if (todays.length > 0) return { heading: "Today's events", items: todays };
  const next = sorted.find((e) => e.date > today);
  if (!next) return null;
  return { heading: `Next events · ${next.date}`, items: sorted.filter((e) => e.date === next.date) };
}

type State = "done" | "now" | "upcoming";

function stateOf(e: TimelineEvent, next: TimelineEvent | undefined, today: string, now: string): State {
  if (e.date < today) return "done";
  if (e.date > today || !e.start) return "upcoming";
  const end = hhmm(e.end) || hhmm(next?.start ?? null) || "23:59";
  if (now >= end) return "done";
  return now >= hhmm(e.start) ? "now" : "upcoming";
}

/** Vertical timeline: finished events struck through, the running one marked NOW. */
export function EventsTimeline({ events }: { events: TimelineEvent[] }) {
  const today = todayVN();
  const now = nowTimeVN();
  return (
    <ol className="grid grid-cols-[52px_14px_1fr] gap-x-2.5">
      {events.map((e, i) => {
        const state = stateOf(e, events[i + 1], today, now);
        const last = i === events.length - 1;
        const sub = [e.place, e.guests ? `${e.guests} guests` : null, e.staff?.length ? e.staff.join(", ") : null].filter(Boolean).join(" · ");
        return (
          <li key={e.key} className="col-span-3 grid grid-cols-subgrid">
            <span className={cn("pt-px text-sm tabular-nums", state === "now" ? "font-bold text-primary" : "text-muted-foreground")}>{hhmm(e.start) || "--:--"}</span>
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "mt-1 box-border h-3 w-3 shrink-0 rounded-full",
                  state === "done" && "bg-success",
                  state === "now" && "bg-primary ring-4 ring-primary/20",
                  state === "upcoming" && "border-2 border-muted-foreground/60"
                )}
              />
              {!last && <span className="w-0.5 flex-1 bg-border" />}
            </div>
            <div className={cn("min-w-0", !last && "pb-3.5")}>
              <div className={cn("text-[15px]", state === "done" ? "text-muted-foreground line-through" : "font-semibold")}>
                {e.title}
                {state === "now" && <span className="ml-1.5 text-xs font-bold text-primary">NOW</span>}
              </div>
              {sub && <div className="text-[13px] text-muted-foreground">{sub}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
