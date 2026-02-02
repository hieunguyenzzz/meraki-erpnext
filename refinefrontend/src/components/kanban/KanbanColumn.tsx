import { useDroppable } from "@dnd-kit/core";
import { KanbanCard } from "./KanbanCard";
import type { ColumnDef, KanbanItem } from "@/lib/kanban";

const colorMap: Record<string, { bg: string; border: string; header: string; dropBorder: string }> = {
  blue:  { bg: "bg-blue-50 dark:bg-blue-950/30",  border: "border-blue-200 dark:border-blue-800",  header: "text-blue-700 dark:text-blue-400",  dropBorder: "border-blue-400 dark:border-blue-500" },
  amber: { bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800", header: "text-amber-700 dark:text-amber-400", dropBorder: "border-amber-400 dark:border-amber-500" },
  green: { bg: "bg-green-50 dark:bg-green-950/30", border: "border-green-200 dark:border-green-800", header: "text-green-700 dark:text-green-400", dropBorder: "border-green-400 dark:border-green-500" },
  rose:  { bg: "bg-rose-50 dark:bg-rose-950/30",  border: "border-rose-200 dark:border-rose-800",  header: "text-rose-700 dark:text-rose-400",  dropBorder: "border-rose-400 dark:border-rose-500" },
};

interface KanbanColumnProps {
  column: ColumnDef;
  items: KanbanItem[];
}

export function KanbanColumn({ column, items }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key });
  const colors = colorMap[column.color] ?? colorMap.blue;

  return (
    <div
      ref={setNodeRef}
      className={`
        flex flex-col rounded-xl border-2 min-h-[300px] transition-colors
        ${colors.bg}
        ${isOver ? colors.dropBorder : colors.border}
      `}
    >
      <div className={`px-3 py-2 flex items-center justify-between border-b ${colors.border}`}>
        <span className={`text-sm font-semibold ${colors.header}`}>{column.label}</span>
        <span className={`text-xs font-medium ${colors.header} opacity-70`}>{items.length}</span>
      </div>
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-220px)]">
        {items.map((item) => (
          <KanbanCard key={item.id} item={item} />
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
