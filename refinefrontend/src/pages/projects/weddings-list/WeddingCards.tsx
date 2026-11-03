import { Link } from "react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin } from "lucide-react";
import type { ProjectKanbanItem } from "@/lib/projectKanban";
import { Countdown, PaidBadge, StageBadge, TypeBadge } from "./WeddingBadges";

/** Phone layout: one tappable card per wedding. */
export function WeddingCards({ items, showPaid }: { items: ProjectKanbanItem[]; showPaid: boolean }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((w) => (
        <li key={w.id}>
          <Link
            to={`/projects/${w.id}`}
            className="flex flex-col gap-2 rounded-card border bg-card p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 break-words font-display text-[24px] font-semibold leading-6 lining-nums">
                {w.customer_name || w.project_name}
              </span>
              <Countdown date={w.expected_end_date} className="shrink-0" />
            </div>
            <span className="text-sm tabular-nums text-muted-foreground">{w.expected_end_date?.slice(0, 10) ?? "Date TBC"}</span>
            {w.venue_name && (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{w.venue_name}</span>
              </span>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              <StageBadge stage={w.custom_project_stage} />
              {w.custom_wedding_type && <TypeBadge type={w.custom_wedding_type} />}
              {showPaid && w.per_billed != null && <PaidBadge percent={w.per_billed} />}
              {w.lead_planner_name && <span className="ml-auto text-xs text-muted-foreground">{w.lead_planner_name}</span>}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function WeddingCardsSkeleton() {
  return (
    <div className="flex flex-col gap-2.5" aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2.5 rounded-card border bg-card p-4">
          <Skeleton className="h-6 w-3/5" />
          <Skeleton className="h-3.5 w-2/5" />
          <Skeleton className="h-3.5 w-1/2" />
        </div>
      ))}
    </div>
  );
}
