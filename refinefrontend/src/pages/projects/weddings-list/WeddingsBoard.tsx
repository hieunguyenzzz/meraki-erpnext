import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BoardCard } from "./BoardCard";
import { Skeleton } from "@/components/ui/skeleton";
import { PROJECT_COLUMNS, getProjectColumnKey, type ProjectKanbanItem } from "@/lib/projectKanban";

const STORAGE_KEY = "wedding-board-completed-open";

function readOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch (err) {
    console.error("Read board state failed", err);
    return false;
  }
}

/** Desktop board: one column per stage; Completed folds away by default. */
export function WeddingsBoard({ items }: { items: ProjectKanbanItem[] }) {
  const [completedOpen, setCompletedOpen] = useState(readOpen);

  const toggleCompleted = () => {
    const next = !completedOpen;
    setCompletedOpen(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch (err) {
      console.error("Save board state failed", err);
    }
  };

  const inColumn = (key: string) => items.filter((p) => getProjectColumnKey(p) === key);
  const visible = PROJECT_COLUMNS.filter((c) => !c.collapsible || completedOpen);
  const folded = PROJECT_COLUMNS.filter((c) => c.collapsible && !completedOpen);

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {visible.map((col) => {
        const colItems = inColumn(col.key);
        return (
          <section key={col.key} aria-label={col.label} className="flex min-h-[20rem] min-w-[190px] flex-1 flex-col rounded-card border bg-secondary/50">
            <header className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
              <h2 className="text-[13px] font-semibold">{col.label}</h2>
              <span className="flex items-center gap-1 text-xs font-semibold tabular-nums text-muted-foreground">
                {colItems.length}
                {col.collapsible && (
                  <button type="button" onClick={toggleCompleted} aria-label={`Collapse ${col.label}`} className="rounded-full p-1 hover:bg-muted">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                )}
              </span>
            </header>
            <div className="flex max-h-[calc(100dvh-20rem)] flex-1 flex-col gap-2 overflow-y-auto p-2">
              {colItems.map((item) => (
                <BoardCard key={item.id} item={item} />
              ))}
              {colItems.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">No weddings</p>}
            </div>
          </section>
        );
      })}
      {folded.map((col) => (
        <button
          key={col.key}
          type="button"
          onClick={toggleCompleted}
          aria-label={`Show ${col.label}`}
          className="flex w-24 shrink-0 flex-col items-center gap-1 self-start rounded-card border bg-secondary/50 px-2 py-3 text-center hover:bg-muted"
        >
          <span className="text-xs font-semibold">{col.label}</span>
          <span className="text-xl font-bold tabular-nums">{inColumn(col.key).length}</span>
          <span className="flex items-center text-xs text-muted-foreground">
            Show <ChevronRight className="h-3 w-3" />
          </span>
        </button>
      ))}
    </div>
  );
}

export function WeddingsBoardSkeleton() {
  return (
    <div className="grid grid-cols-5 gap-3" aria-busy="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex min-h-[20rem] flex-col gap-3 rounded-card border bg-secondary/50 p-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ))}
    </div>
  );
}
