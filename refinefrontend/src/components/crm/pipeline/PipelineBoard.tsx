import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { COLUMNS, getColumnForItem, type ColumnKey, type KanbanItem } from "@/lib/kanban";
import { PipelineCard } from "./PipelineCard";

function groupByStage(items: KanbanItem[]) {
  const grouped = Object.fromEntries(COLUMNS.map((c) => [c.key, [] as KanbanItem[]])) as Record<ColumnKey, KanbanItem[]>;
  for (const item of items) grouped[getColumnForItem(item)].push(item);
  return grouped;
}

function EmptyStage({ label }: { label: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">No leads in {label}</p>;
}

/** Desktop: six columns side by side, scrolling sideways when the window is narrow. */
function DesktopBoard({ grouped }: { grouped: Record<ColumnKey, KanbanItem[]> }) {
  return (
    <div className="hidden overflow-x-auto pb-2 md:block">
      <div className="flex w-max gap-3">
        {COLUMNS.map((col) => (
          <section key={col.key} aria-label={`${col.label}, ${grouped[col.key].length} leads`} className="flex w-[248px] shrink-0 flex-col gap-2.5 rounded-card bg-secondary p-3">
            <h2 className="px-1 text-sm font-bold">
              {col.label} <span className="font-medium text-muted-foreground">· {grouped[col.key].length}</span>
            </h2>
            <div className="flex max-h-[calc(100vh-280px)] flex-col gap-2.5 overflow-y-auto">
              {grouped[col.key].map((item) => <PipelineCard key={item.id} item={item} />)}
              {grouped[col.key].length === 0 && <EmptyStage label={col.label} />}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Phones: pick one stage, read its leads as a list. No drag on a touch screen. */
function PhonePipeline({ grouped }: { grouped: Record<ColumnKey, KanbanItem[]> }) {
  const [active, setActive] = useState<ColumnKey>("new");
  const current = COLUMNS.find((c) => c.key === active) ?? COLUMNS[0];

  return (
    <div className="md:hidden">
      <div role="tablist" aria-label="Pipeline stage" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {COLUMNS.map((col) => {
          const selected = col.key === active;
          return (
            <button
              key={col.key}
              role="tab"
              id={`stage-tab-${col.key}`}
              aria-selected={selected}
              aria-controls="stage-panel"
              onClick={() => setActive(col.key)}
              className="flex h-12 shrink-0 items-center focus-visible:outline-none"
            >
              <span
                className={cn(
                  "flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold",
                  selected ? "border-foreground bg-foreground text-background" : "border-input bg-card text-foreground",
                )}
              >
                {col.label}
                <span className={cn("tabular-nums", selected ? "opacity-80" : "text-muted-foreground")}>· {grouped[col.key].length}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div id="stage-panel" role="tabpanel" aria-labelledby={`stage-tab-${active}`} className="mt-3 flex flex-col gap-2.5">
        {grouped[active].map((item) => <PipelineCard key={item.id} item={item} />)}
        {grouped[active].length === 0 && <EmptyStage label={current.label} />}
      </div>
    </div>
  );
}

export function PipelineBoard({ items }: { items: KanbanItem[] }) {
  const grouped = useMemo(() => groupByStage(items), [items]);
  return (
    <>
      <DesktopBoard grouped={grouped} />
      <PhonePipeline grouped={grouped} />
    </>
  );
}
