import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Star, MessageSquare, Gift } from "lucide-react";
import { isPipelineItemLocked, type RecruitingItem } from "@/lib/recruiting-kanban";
import { formatAge } from "@/lib/kanban";

interface RecruitingCardProps {
  item: RecruitingItem;
  isDragOverlay?: boolean;
}

export function RecruitingCard({ item, isDragOverlay }: RecruitingCardProps) {
  const locked = isPipelineItemLocked(item);
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`rounded-lg border bg-card p-3 space-y-1.5 touch-none ${locked ? "cursor-default" : "cursor-grab active:cursor-grabbing"}`}
    >
      <Link
        to={`/hr/recruiting/${item.id}`}
        className="text-sm font-medium text-primary hover:underline truncate block"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {item.applicantName}
      </Link>
      {item.jobTitle && (
        <div className="text-xs text-muted-foreground truncate">{item.jobTitle}</div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {item.source && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{item.source}</Badge>
        )}
        {item.rating > 0 && (
          <span className="flex items-center gap-0.5 text-amber-500">
            <Star className="h-3 w-3 fill-current" />
            <span className="text-[10px] font-medium">{item.rating}/1</span>
          </span>
        )}
        <span className="text-[10px] text-muted-foreground opacity-60">{formatAge(item.creation)}</span>
      </div>
      {(item.hasInterview || item.hasOffer) && (
        <div className="flex items-center gap-2">
          {item.hasInterview && (
            <span className="flex items-center gap-0.5 text-purple-600 dark:text-purple-400">
              <MessageSquare className="h-3 w-3" />
              <span className="text-[10px]">Interview</span>
            </span>
          )}
          {item.hasOffer && (
            <span className="flex items-center gap-0.5 text-green-600 dark:text-green-400">
              <Gift className="h-3 w-3" />
              <span className="text-[10px]">Offer</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
