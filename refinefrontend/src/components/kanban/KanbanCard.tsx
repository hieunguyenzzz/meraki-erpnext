import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import type { KanbanItem } from "@/lib/kanban";
import { getColumnForItem, getDocName, formatAge, hoursElapsed, formatMeetingDate } from "@/lib/kanban";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

interface KanbanCardProps {
  item: KanbanItem;
}

function waitingClasses(waitingFor: "client" | "staff", hours: number): string {
  if (hours >= 48) return "text-red-600 dark:text-red-400 bg-red-50/80 dark:bg-red-950/40";
  if (hours >= 24) return "text-amber-600 dark:text-amber-400 bg-amber-50/80 dark:bg-amber-950/40";
  if (waitingFor === "client") return "text-blue-600 dark:text-blue-400 bg-blue-50/80 dark:bg-blue-950/40";
  return "text-muted-foreground bg-muted/40";
}

function NewIndicator({ item }: { item: KanbanItem }) {
  const activity = item.lastActivity;
  const timestamp = activity?.date ?? item.creation;
  const hours = hoursElapsed(timestamp);
  // If we have activity data, use the actual waitingFor; otherwise default to staff (new lead)
  const waiting: "client" | "staff" = activity?.waitingFor ?? "staff";
  const label = waiting === "client" ? `Awaiting client · ${formatAge(timestamp)}` : `Awaiting staff · ${formatAge(timestamp)}`;

  return (
    <div className={`mt-1 rounded-md px-2 py-1 text-xs font-medium ${waitingClasses(waiting, hours)}`}>
      {label}
    </div>
  );
}

function EngagedIndicator({ item }: { item: KanbanItem }) {
  const activity = item.lastActivity;
  const timestamp = activity?.date ?? item.creation;
  const hours = hoursElapsed(timestamp);
  const age = formatAge(timestamp);
  const waiting: "client" | "staff" = activity?.waitingFor === "client" ? "client" : "staff";
  const label = waiting === "client" ? `Awaiting client · ${age}` : `Awaiting staff · ${age}`;

  return (
    <div className={`mt-1 rounded-md px-2 py-1 text-xs font-medium ${waitingClasses(waiting, hours)}`}>
      {label}
    </div>
  );
}

export function KanbanCard({ item }: KanbanCardProps) {
  const column = getColumnForItem(item);

  const detailPath = item.doctype === "Lead"
    ? `/crm/leads/${getDocName(item)}`
    : `/crm/opportunities/${getDocName(item)}`;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 space-y-2",
        // Mobile: larger touch target with min height
        "min-h-[72px] md:min-h-0",
        "hover:shadow-sm"
      )}
    >
      <div className="flex items-center gap-2">
        <Badge
          variant={item.doctype === "Lead" ? "info" : "warning"}
          className="text-[10px] px-1.5 py-0 shrink-0"
        >
          {item.doctype === "Lead" ? "Lead" : "Opp"}
        </Badge>
        <Link
          to={detailPath}
          className="text-sm font-medium text-foreground hover:text-primary hover:underline truncate"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {item.displayName}
        </Link>
      </div>
      <div className="text-xs text-muted-foreground space-y-0.5">
        {item.email && <div className="truncate">{item.email}</div>}
        {item.phone && <div>{item.phone}</div>}
        <div className="text-[10px] opacity-50">{item.status}</div>
      </div>
      {column === "new" && <NewIndicator item={item} />}
      {(column === "engaged" || column === "meeting" || column === "quoted") && <EngagedIndicator item={item} />}
      {item.meetingDate && (
        <div className="mt-1 flex items-center gap-1 text-xs font-medium text-cyan-600 dark:text-cyan-400">
          <CalendarDays className="h-3 w-3" />
          {formatMeetingDate(item.meetingDate)}
        </div>
      )}
    </div>
  );
}
