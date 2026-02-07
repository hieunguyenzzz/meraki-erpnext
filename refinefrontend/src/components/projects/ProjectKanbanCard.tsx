import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { MapPin, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectKanbanItem } from "@/lib/projectKanban";
import { formatDaysUntilWedding } from "@/lib/projectKanban";

interface ProjectKanbanCardProps {
  item: ProjectKanbanItem;
}

const stageBadgeColors: Record<string, string> = {
  Onboarding: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  Planning: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  "Final Details": "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300",
  "Wedding Week": "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
  "Day-of": "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
  Completed: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
};

const countdownColors: Record<string, string> = {
  muted: "text-muted-foreground bg-muted/50",
  rose: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40",
  amber: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40",
  cyan: "text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/40",
};

export function ProjectKanbanCard({ item }: ProjectKanbanCardProps) {
  const weddingCountdown = item.expected_end_date
    ? formatDaysUntilWedding(item.expected_end_date)
    : null;

  const weddingDateFormatted = item.expected_end_date
    ? new Date(item.expected_end_date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 space-y-2",
        "min-h-[72px] md:min-h-0",
        "hover:shadow-sm transition-shadow"
      )}
    >
      {/* Header: Stage badge + countdown */}
      <div className="flex items-center justify-between gap-2">
        <Badge
          className={cn(
            "text-[10px] px-1.5 py-0 font-medium border-0",
            stageBadgeColors[item.custom_project_stage] || stageBadgeColors.Planning
          )}
        >
          {item.custom_project_stage || "Planning"}
        </Badge>
        {weddingCountdown && (
          <span
            className={cn(
              "text-[10px] font-semibold px-1.5 py-0.5 rounded",
              countdownColors[weddingCountdown.color] || countdownColors.muted
            )}
          >
            {weddingCountdown.text}
          </span>
        )}
      </div>

      {/* Client name (clickable) */}
      <Link
        to={`/projects/${item.id}`}
        className="block text-sm font-medium text-foreground hover:text-primary hover:underline truncate"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {item.customer_name || item.project_name}
      </Link>

      {/* Wedding date + venue */}
      <div className="text-xs text-muted-foreground space-y-1">
        {weddingDateFormatted && (
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3 w-3 shrink-0" />
            <span>{weddingDateFormatted}</span>
          </div>
        )}
        {item.venue_name && (
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{item.venue_name}</span>
          </div>
        )}
      </div>
    </div>
  );
}
