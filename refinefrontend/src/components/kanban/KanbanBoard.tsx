import { useState, useCallback, useEffect, type ReactNode } from "react";
import { KanbanColumn, MobileKanbanList, colorMap } from "./KanbanColumn";
import { KanbanCard } from "./KanbanCard";
import {
  COLUMNS,
  getColumnForItem,
  type ColumnDef,
} from "@/lib/kanban";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

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
  /** Custom card renderer. Defaults to CRM KanbanCard. */
  renderCard?: (item: any, isDragOverlay?: boolean) => ReactNode;
}

export function KanbanBoard({
  items,
  columns: columnsProp,
  getColumnForItem: getColumnFn,
  renderCard,
}: KanbanBoardProps) {
  const columns = columnsProp ?? COLUMNS;
  const getColumn = getColumnFn ?? ((item: any) => getColumnForItem(item));

  const [mobileActiveTab, setMobileActiveTab] = useState<string>(columns[0]?.key ?? "new");

  // Collapsed columns state with localStorage persistence
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    const stored = localStorage.getItem("kanban-collapsed-columns");
    if (stored) {
      try {
        return new Set(JSON.parse(stored));
      } catch {
        // Invalid JSON, use defaults
      }
    }
    // Default: collapse columns marked as collapsedByDefault
    const defaults = (columns as ColumnDef[])
      .filter((c) => c.collapsedByDefault)
      .map((c) => c.key);
    return new Set(defaults);
  });

  // Persist collapsed state to localStorage
  useEffect(() => {
    localStorage.setItem(
      "kanban-collapsed-columns",
      JSON.stringify([...collapsedColumns])
    );
  }, [collapsedColumns]);

  const toggleColumnCollapse = useCallback((columnKey: string) => {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnKey)) {
        next.delete(columnKey);
      } else {
        next.add(columnKey);
      }
      return next;
    });
  }, []);

  const toggleAllCollapsible = useCallback(() => {
    const collapsibleKeys = (columns as ColumnDef[])
      .filter((c) => c.collapsible)
      .map((c) => c.key);
    const allCollapsed = collapsibleKeys.every((k) => collapsedColumns.has(k));

    if (allCollapsed) {
      // Expand all
      setCollapsedColumns((prev) => {
        const next = new Set(prev);
        collapsibleKeys.forEach((k) => next.delete(k));
        return next;
      });
    } else {
      // Collapse all
      setCollapsedColumns((prev) => {
        const next = new Set(prev);
        collapsibleKeys.forEach((k) => next.add(k));
        return next;
      });
    }
  }, [columns, collapsedColumns]);

  const columnItems = useCallback(
    (key: string) => items.filter((item) => getColumn(item) === key),
    [items, getColumn]
  );

  // Color mapping for mobile tabs
  const tabColors: Record<string, { active: string; inactive: string; dot: string }> = {
    blue: { active: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300", inactive: "text-muted-foreground hover:bg-muted", dot: "bg-blue-500" },
    amber: { active: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300", inactive: "text-muted-foreground hover:bg-muted", dot: "bg-amber-500" },
    cyan: { active: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300", inactive: "text-muted-foreground hover:bg-muted", dot: "bg-cyan-500" },
    green: { active: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300", inactive: "text-muted-foreground hover:bg-muted", dot: "bg-green-500" },
    rose: { active: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300", inactive: "text-muted-foreground hover:bg-muted", dot: "bg-rose-500" },
    purple: { active: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300", inactive: "text-muted-foreground hover:bg-muted", dot: "bg-purple-500" },
    indigo: { active: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300", inactive: "text-muted-foreground hover:bg-muted", dot: "bg-indigo-500" },
  };

  return (
    <div className="space-y-3">
      {/* Desktop: flexible grid with collapsed columns */}
      <div className="hidden md:flex gap-3">
        {/* Regular (visible) columns */}
        {columns
          .filter((col) => !collapsedColumns.has(col.key))
          .map((col) => (
            <div key={col.key} className="flex-1 min-w-0">
              <KanbanColumn
                column={col}
                items={columnItems(col.key)}
                renderCard={renderCard ? (item) => renderCard(item, false) : undefined}
                collapsible={(col as ColumnDef).collapsible}
                onCollapse={
                  (col as ColumnDef).collapsible
                    ? () => toggleColumnCollapse(col.key)
                    : undefined
                }
              />
            </div>
          ))}

        {/* Collapsed columns summary */}
        {columns.some(
          (col) => (col as ColumnDef).collapsible && collapsedColumns.has(col.key)
        ) && (
          <CollapsedColumnsSummary
            columns={columns.filter((col) => collapsedColumns.has(col.key))}
            itemCounts={columns
              .filter((c) => collapsedColumns.has(c.key))
              .reduce(
                (acc, col) => ({
                  ...acc,
                  [col.key]: columnItems(col.key).length,
                }),
                {} as Record<string, number>
              )}
            onExpand={toggleAllCollapsible}
          />
        )}
      </div>

      {/* Mobile: Tabs + vertical list */}
      <div className="md:hidden">
        {/* Scrollable stage tabs */}
        <div className="flex gap-1 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
          {columns.map((col) => {
            const count = columnItems(col.key).length;
            const isActive = mobileActiveTab === col.key;
            const colors = tabColors[col.color] ?? tabColors.blue;

            return (
              <button
                key={col.key}
                onClick={() => setMobileActiveTab(col.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                  isActive ? colors.active : colors.inactive
                )}
              >
                {isActive && <span className={cn("w-1.5 h-1.5 rounded-full", colors.dot)} />}
                {col.label}
                <span className={cn(
                  "ml-1 text-xs",
                  isActive ? "opacity-80" : "opacity-60"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Vertical card list for active tab */}
        {columns.map((col) => (
          <MobileKanbanList
            key={col.key}
            column={col}
            items={columnItems(col.key)}
            isVisible={mobileActiveTab === col.key}
            renderCard={renderCard ? (item) => renderCard(item, false) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

/** Summary display for collapsed columns (Won/Lost) */
interface CollapsedColumnsSummaryProps {
  columns: { key: string; label: string; color: string }[];
  itemCounts: Record<string, number>;
  onExpand: () => void;
}

function CollapsedColumnsSummary({
  columns,
  itemCounts,
  onExpand,
}: CollapsedColumnsSummaryProps) {
  return (
    <div className="flex flex-col gap-2 w-24 shrink-0">
      {columns.map((col) => {
        const colors = colorMap[col.color] ?? colorMap.blue;
        return (
          <div
            key={col.key}
            className={cn(
              "rounded-lg border p-2 text-center",
              colors.bg,
              colors.border
            )}
          >
            <div className={cn("text-xs font-medium truncate", colors.header)}>
              {col.label}
            </div>
            <div className={cn("text-xl font-bold tabular-nums", colors.header)}>
              {itemCounts[col.key] || 0}
            </div>
          </div>
        );
      })}
      <button
        onClick={onExpand}
        className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5 px-2 rounded hover:bg-muted"
      >
        <ChevronRight className="h-3 w-3" />
        Show
      </button>
    </div>
  );
}
