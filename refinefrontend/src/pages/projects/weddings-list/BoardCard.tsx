import { Link } from "react-router";
import { MapPin, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/initials";
import type { ProjectKanbanItem } from "@/lib/projectKanban";
import { Countdown, StageBadge, TypeBadge } from "./WeddingBadges";

function Planner({ name, role, tone }: { name: string; role: string; tone: string }) {
  return (
    <div className="flex items-center gap-1.5" title={`${role}: ${name}`}>
      <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold", tone)}>
        {getInitials(name)}
      </span>
      <span className="max-w-[72px] truncate text-xs text-muted-foreground">{name.split(" ")[0]}</span>
    </div>
  );
}

/** Board card: stage, countdown, couple, date, venue, lead and support planner. Whole card opens the wedding. */
export function BoardCard({ item }: { item: ProjectKanbanItem }) {
  return (
    <Link
      to={`/projects/${item.id}`}
      className="flex min-h-[72px] shrink-0 flex-col gap-2 rounded-card border bg-card p-3 transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center justify-between gap-2">
        <StageBadge stage={item.custom_project_stage} />
        <Countdown date={item.expected_end_date} />
      </div>

      <span className="truncate text-sm font-semibold">{item.customer_name || item.project_name}</span>

      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        {item.expected_end_date && (
          <span className="flex items-center gap-1.5 tabular-nums">
            <Calendar className="h-3 w-3 shrink-0" aria-hidden />
            {item.expected_end_date.slice(0, 10)}
          </span>
        )}
        {(item.venue_name || item.custom_wedding_type) && (
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
            {item.venue_name && <span className="truncate">{item.venue_name}</span>}
            {item.custom_wedding_type && <TypeBadge type={item.custom_wedding_type} />}
          </span>
        )}
      </div>

      {(item.lead_planner_name || item.support_planner_name) && (
        <div className="flex items-center gap-3 border-t pt-2">
          {item.lead_planner_name && <Planner name={item.lead_planner_name} role="Lead" tone="bg-warning-soft text-warning-soft-foreground" />}
          {item.support_planner_name && <Planner name={item.support_planner_name} role="Support" tone="bg-success-soft text-success-soft-foreground" />}
        </div>
      )}
    </Link>
  );
}
