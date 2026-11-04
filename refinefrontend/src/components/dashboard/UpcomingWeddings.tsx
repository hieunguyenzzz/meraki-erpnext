import { Link } from "react-router";
import type { MyWedding } from "@/hooks/useMyWeddings";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function daysLabel(days: number | null): string {
  if (days == null) return "";
  return days === 0 ? "today" : `${days} ${days === 1 ? "day" : "days"}`;
}

/** The next weddings after the hero one, as a card list. */
export function UpcomingWeddings({ weddings, basePath }: { weddings: MyWedding[]; basePath: string }) {
  if (weddings.length === 0) return null;
  return (
    <section aria-label="Upcoming weddings" className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-4 md:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-semibold">Upcoming weddings</h2>
        <Link to={basePath} className="text-sm font-semibold text-primary hover:underline">All</Link>
      </div>
      <div>
        {weddings.map((w, i) => (
          <Link
            key={w.id}
            to={`${basePath}/${w.id}`}
            className={`flex min-h-14 items-center gap-3.5 text-foreground no-underline hover:bg-accent/40 ${i > 0 ? "border-t" : ""}`}
          >
            <span className="w-[46px] text-center font-display text-2xl font-semibold leading-6 text-accent-foreground lining-nums tabular-nums">
              {w.wedding_date?.slice(8, 10)}
              <br />
              <span className="font-sans text-[11px] font-normal text-muted-foreground">{w.wedding_date ? MONTHS[Number(w.wedding_date.slice(5, 7)) - 1] : ""}</span>
            </span>
            <span className="min-w-0 flex-1 text-sm">
              <b className="block truncate">{w.couple_label || w.project_name}</b>
              <span className="block truncate text-muted-foreground">{[w.venue_name, daysLabel(w.days_to_go)].filter(Boolean).join(" · ")}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
