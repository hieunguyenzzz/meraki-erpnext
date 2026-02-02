import { useState, useCallback, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanCard } from "./KanbanCard";
import {
  COLUMNS,
  getColumnForItem,
  getTargetStatus,
  type KanbanItem,
  type ColumnKey,
} from "@/lib/kanban";

interface KanbanBoardProps {
  items: KanbanItem[];
  onUpdateStatus: (item: KanbanItem, newStatus: string) => Promise<void>;
  onConvertLead?: (item: KanbanItem, targetColumnKey: ColumnKey) => Promise<void>;
}

export function KanbanBoard({ items, onUpdateStatus, onConvertLead }: KanbanBoardProps) {
  const [localItems, setLocalItems] = useState<KanbanItem[]>(items);
  const [activeItem, setActiveItem] = useState<KanbanItem | null>(null);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync when parent items change (e.g. after refetch), but skip during active drag
  useEffect(() => {
    if (!activeItem) {
      setLocalItems(items);
    }
  }, [items, activeItem]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const columnItems = useCallback(
    (key: ColumnKey) => localItems.filter((item) => getColumnForItem(item) === key),
    [localItems]
  );

  function handleDragStart(event: DragStartEvent) {
    const item = event.active.data.current as KanbanItem | undefined;
    setActiveItem(item ?? null);
    setError(null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveItem(null);

    const { active, over } = event;
    if (!over) return;

    const item = active.data.current as KanbanItem | undefined;
    if (!item) return;

    const targetColumnKey = over.id as ColumnKey;
    const currentColumn = getColumnForItem(item);
    if (targetColumnKey === currentColumn) return;

    const targetColumn = COLUMNS.find((c) => c.key === targetColumnKey);
    if (!targetColumn) return;

    const newStatus = getTargetStatus(targetColumn, item.doctype);

    // Lead dropped on an Opportunity-only column → convert instead of status update
    const isConversion = item.doctype === "Lead" && newStatus === "" && onConvertLead;
    if (isConversion) {
      const snapshot = localItems;
      // Optimistic: remove the Lead (it will reappear as an Opportunity after refetch)
      setLocalItems((prev) => prev.filter((i) => i.id !== item.id));
      setUpdating(true);
      try {
        await onConvertLead(item, targetColumnKey);
      } catch (err) {
        setLocalItems(snapshot);
        const msg = err instanceof Error ? err.message : `Failed to convert ${item.displayName}`;
        setError(msg);
      } finally {
        setUpdating(false);
      }
      return;
    }

    // Don't proceed if there's no valid target status
    if (!newStatus) return;

    // Optimistic update
    const snapshot = localItems;
    setLocalItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: newStatus } : i))
    );

    setUpdating(true);
    try {
      await onUpdateStatus({ ...item, status: newStatus }, newStatus);
    } catch (err) {
      // Rollback
      setLocalItems(snapshot);
      const msg = err instanceof Error ? err.message : `Failed to move ${item.displayName}`;
      setError(msg);
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
          <button
            className="ml-3 underline text-xs"
            onClick={() => setError(null)}
          >
            dismiss
          </button>
        </div>
      )}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className={`grid grid-cols-6 gap-3 transition-opacity ${updating ? "opacity-40 pointer-events-none" : ""}`}>
          {COLUMNS.map((col) => (
            <KanbanColumn key={col.key} column={col} items={columnItems(col.key)} />
          ))}
        </div>
        {updating && (
          <div className="text-center text-sm text-muted-foreground py-1">Updating...</div>
        )}
        <DragOverlay>
          {activeItem ? <KanbanCard item={activeItem} isDragOverlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
