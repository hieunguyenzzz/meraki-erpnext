import type { ReactNode } from "react";
import { KanbanCard } from "./KanbanCard";
import type { KanbanItem } from "@/lib/kanban";
import { cn } from "@/lib/utils";
import { ChevronLeft } from "lucide-react";

const colorMap: Record<string, { bg: string; border: string; header: string; dropBorder: string }> = {
  blue:   { bg: "bg-blue-50/50 dark:bg-blue-950/20",   border: "border-blue-200/60 dark:border-blue-800/60",   header: "text-blue-700 dark:text-blue-400",   dropBorder: "border-blue-400 dark:border-blue-500" },
  amber:  { bg: "bg-amber-50/50 dark:bg-amber-950/20",  border: "border-amber-200/60 dark:border-amber-800/60",  header: "text-amber-700 dark:text-amber-400",  dropBorder: "border-amber-400 dark:border-amber-500" },
  cyan:   { bg: "bg-cyan-50/50 dark:bg-cyan-950/20",   border: "border-cyan-200/60 dark:border-cyan-800/60",   header: "text-cyan-700 dark:text-cyan-400",   dropBorder: "border-cyan-400 dark:border-cyan-500" },
  green:  { bg: "bg-green-50/50 dark:bg-green-950/20",  border: "border-green-200/60 dark:border-green-800/60",  header: "text-green-700 dark:text-green-400",  dropBorder: "border-green-400 dark:border-green-500" },
  rose:   { bg: "bg-rose-50/50 dark:bg-rose-950/20",   border: "border-rose-200/60 dark:border-rose-800/60",   header: "text-rose-700 dark:text-rose-400",   dropBorder: "border-rose-400 dark:border-rose-500" },
  purple: { bg: "bg-purple-50/50 dark:bg-purple-950/20", border: "border-purple-200/60 dark:border-purple-800/60", header: "text-purple-700 dark:text-purple-400", dropBorder: "border-purple-400 dark:border-purple-500" },
  indigo: { bg: "bg-indigo-50/50 dark:bg-indigo-950/20", border: "border-indigo-200/60 dark:border-indigo-800/60", header: "text-indigo-700 dark:text-indigo-400", dropBorder: "border-indigo-400 dark:border-indigo-500" },
};

export { colorMap };

interface GenericColumnDef {
  key: string;
  label: string;
  color: string;
}

interface KanbanColumnProps {
  column: GenericColumnDef;
  items: Array<{ id: string; [k: string]: any }>;
  renderCard?: (item: any) => ReactNode;
  collapsible?: boolean;
  onCollapse?: () => void;
}

export function KanbanColumn({ column, items, renderCard, collapsible, onCollapse }: KanbanColumnProps) {
  const colors = colorMap[column.color] ?? colorMap.blue;

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border min-h-[300px]",
        colors.bg,
        colors.border
      )}
    >
      <div className={cn("px-3 py-2.5 flex items-center justify-between border-b", colors.border)}>
        <span className={cn("text-xs font-medium uppercase tracking-wide", colors.header)}>{column.label}</span>
        <div className="flex items-center gap-1">
          <span className={cn("text-xs font-medium tabular-nums", colors.header, "opacity-70")}>{items.length}</span>
          {collapsible && onCollapse && (
            <button
              onClick={onCollapse}
              className={cn(
                "ml-1 p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors",
                colors.header
              )}
              title="Collapse column"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-220px)]">
        {items.map((item) => (
          renderCard ? renderCard(item) : <KanbanCard key={item.id} item={item as KanbanItem} />
        ))}
        {items.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-8 opacity-50">
            No items
          </div>
        )}
      </div>
    </div>
  );
}

/** Mobile-optimized vertical list for a single column */
interface MobileKanbanListProps {
  column: GenericColumnDef;
  items: Array<{ id: string; [k: string]: any }>;
  isVisible: boolean;
  renderCard?: (item: any) => ReactNode;
}

export function MobileKanbanList({ column, items, isVisible, renderCard }: MobileKanbanListProps) {
  const colors = colorMap[column.color] ?? colorMap.blue;

  if (!isVisible) return null;

  return (
    <div
      className={cn(
        "mt-3 rounded-lg border p-3 min-h-[200px]",
        colors.bg,
        colors.border
      )}
    >
      <div className="space-y-3">
        {items.map((item) => (
          renderCard ? renderCard(item) : <KanbanCard key={item.id} item={item as KanbanItem} />
        ))}
        {items.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-12">
            No items in {column.label}
          </div>
        )}
      </div>
    </div>
  );
}
