import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import type { KanbanItem } from "@/lib/kanban";
import { getColumnForItem, getDocName, isItemLocked, formatAge, hoursElapsed } from "@/lib/kanban";

interface KanbanCardProps {
  item: KanbanItem;
  isDragOverlay?: boolean;
}

function ageClasses(hours: number): string {
  if (hours >= 48) return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30";
  if (hours >= 24) return "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30";
  return "text-muted-foreground bg-muted/50";
}

function NewIndicator({ creation }: { creation: string }) {
  const hours = hoursElapsed(creation);
  return (
    <div className={`mt-1 rounded-md px-2 py-1 text-xs font-medium ${ageClasses(hours)}`}>
      Waiting {formatAge(creation)}
    </div>
  );
}

function EngagedIndicator({ item }: { item: KanbanItem }) {
  const activity = item.lastActivity;
  const timestamp = activity?.date ?? item.creation;
  const hours = hoursElapsed(timestamp);
  const age = formatAge(timestamp);

  let label: string;
  if (!activity) {
    label = `No activity - ${age}`;
  } else if (activity.waitingFor === "client") {
    label = `Awaiting client - ${age}`;
  } else {
    label = `Awaiting staff - ${age}`;
  }

  return (
    <div className={`mt-1 rounded-md px-2 py-1 text-xs font-medium ${ageClasses(hours)}`}>
      {label}
    </div>
  );
}

export function KanbanCard({ item, isDragOverlay }: KanbanCardProps) {
  const locked = isItemLocked(item);
  const column = getColumnForItem(item);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    data: item,
    disabled: locked,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.3 : locked ? 0.6 : 1,
    ...(isDragOverlay
      ? { transform: "rotate(2deg)", boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }
      : {}),
  };

  const detailPath = item.doctype === "Lead"
    ? `/crm/leads/${getDocName(item)}`
    : `/crm/opportunities/${getDocName(item)}`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`rounded-lg border bg-card p-3 space-y-2 touch-none ${locked ? "cursor-default" : "cursor-grab active:cursor-grabbing"}`}
    >
      <div className="flex items-center gap-2">
        <Badge
          variant={item.doctype === "Lead" ? "info" : "warning"}
          className="text-[10px] px-1.5 py-0"
        >
          {item.doctype === "Lead" ? "Lead" : "Opp"}
        </Badge>
        <Link
          to={detailPath}
          className="text-sm font-medium text-primary hover:underline truncate"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {item.displayName}
        </Link>
      </div>
      <div className="text-xs text-muted-foreground space-y-0.5">
        {item.email && <div className="truncate">{item.email}</div>}
        {item.phone && <div>{item.phone}</div>}
        <div className="text-[10px] opacity-60">{item.status}</div>
      </div>
      {column === "new" && <NewIndicator creation={item.creation} />}
      {column === "engaged" && <EngagedIndicator item={item} />}
    </div>
  );
}
