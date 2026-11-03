import { Link } from "react-router";
import { countdownLabel, type MyWedding } from "@/hooks/useMyWeddings";

/** Horizontal strip of the next weddings after the hero one. */
export function UpcomingWeddings({ weddings, basePath }: { weddings: MyWedding[]; basePath: string }) {
  if (weddings.length === 0) return null;
  return (
    <section aria-label="Upcoming weddings" className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[17px] font-semibold">Upcoming weddings</h2>
        <Link to={basePath} className="text-sm font-semibold text-primary hover:underline">View all</Link>
      </div>
      <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 scrollbar-hide md:mx-0 md:px-0">
        {weddings.map((w) => (
          <Link
            key={w.id}
            to={`${basePath}/${w.id}`}
            className="flex w-40 shrink-0 flex-col gap-0.5 rounded-2xl border bg-card px-3.5 py-3 transition-colors hover:bg-accent/50"
          >
            <b className="truncate text-[15px]">{w.project_name}</b>
            <span className="text-[13px] text-muted-foreground tabular-nums">{w.wedding_date}</span>
            <span className={`text-[13px] font-semibold ${w.days_to_go != null && w.days_to_go <= 45 ? "text-warning" : "text-muted-foreground"}`}>
              {countdownLabel(w.days_to_go)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
