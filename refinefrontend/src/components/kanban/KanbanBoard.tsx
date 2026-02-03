import { useState, useCallback, useEffect, type ReactNode } from "react";
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

interface GenericColumnDef {
  key: string;
  label: string;
  color: string;
}

interface KanbanBoardProps {
  /** Items to display. Generic boards pass any shape with `id` + `status`. */
  items: any[];
  /** Column definitions. Defaults to CRM COLUMNS if not provided. */
  columns?: GenericColumnDef[];
  /** Map an item to its column key. Defaults to CRM getColumnForItem. */
  getColumnForItem?: (item: any) => string;
  /** Get the new status value when dropping into a column. Defaults to CRM getTargetStatus. */
  getTargetStatus?: (columnKey: string, item: any) => string;
  /** Custom card renderer. Defaults to CRM KanbanCard. */
  renderCard?: (item: any, isDragOverlay?: boolean) => ReactNode;
  onUpdateStatus: (item: any, newStatus: string, targetColumn: string) => Promise<void>;
  onConvertLead?: (item: KanbanItem, targetColumnKey: ColumnKey) => Promise<void>;
}

export function KanbanBoard({
  items,
  columns: columnsProp,
  getColumnForItem: getColumnFn,
  getTargetStatus: getTargetFn,
  renderCard,
  onUpdateStatus,
  onConvertLead,
}: KanbanBoardProps) {
  const columns = columnsProp ?? COLUMNS;
  const getColumn = getColumnFn ?? ((item: KanbanItem) => getColumnForItem(item));
  const getTarget = getTargetFn ?? ((colKey: string, item: any) => {
    const col = (COLUMNS as any[]).find((c) => c.key === colKey);
    return col ? getTargetStatus(col, item.doctype) : "";
  });

  const [localItems, setLocalItems] = useState<any[]>(items);
  const [activeItem, setActiveItem] = useState<any | null>(null);
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
    (key: string) => localItems.filter((item) => getColumn(item) === key),
    [localItems, getColumn]
  );

  function handleDragStart(event: DragStartEvent) {
    const item = event.active.data.current;
    setActiveItem(item ?? null);
    setError(null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveItem(null);

    const { active, over } = event;
    if (!over) return;

    const item = active.data.current as any;
    if (!item) return;

    const targetColumnKey = over.id as string;
    const currentColumn = getColumn(item);
    if (targetColumnKey === currentColumn) return;

    const targetCol = columns.find((c) => c.key === targetColumnKey);
    if (!targetCol) return;

    const newStatus = getTarget(targetColumnKey, item);

    // Lead conversion (CRM-specific): Lead dropped on Opportunity-only column
    if (item.doctype === "Lead" && newStatus === "" && onConvertLead) {
      const snapshot = localItems;
      setLocalItems((prev) => prev.filter((i) => i.id !== item.id));
      setUpdating(true);
      try {
        await onConvertLead(item as KanbanItem, targetColumnKey as ColumnKey);
      } catch (err) {
        setLocalItems(snapshot);
        const msg = err instanceof Error ? err.message : `Failed to convert ${item.displayName}`;
        setError(msg);
      } finally {
        setUpdating(false);
      }
      return;
    }

    if (!newStatus) return;

    // Optimistic update
    const snapshot = localItems;
    setLocalItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: newStatus } : i))
    );

    setUpdating(true);
    try {
      await onUpdateStatus({ ...item, status: newStatus }, newStatus, targetColumnKey);
    } catch (err) {
      setLocalItems(snapshot);
      const msg = err instanceof Error ? err.message : `Failed to move ${item.displayName ?? "item"}`;
      setError(msg);
    } finally {
      setUpdating(false);
    }
  }

  const defaultOverlay = activeItem ? <KanbanCard item={activeItem} isDragOverlay /> : null;

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
        <div
          className={`grid gap-3 transition-opacity ${updating ? "opacity-40 pointer-events-none" : ""}`}
          style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
        >
          {columns.map((col) => (
            <KanbanColumn
              key={col.key}
              column={col}
              items={columnItems(col.key)}
              renderCard={renderCard ? (item) => renderCard(item, false) : undefined}
            />
          ))}
        </div>
        {updating && (
          <div className="text-center text-sm text-muted-foreground py-1">Updating...</div>
        )}
        <DragOverlay>
          {activeItem
            ? (renderCard ? renderCard(activeItem, true) : defaultOverlay)
            : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
