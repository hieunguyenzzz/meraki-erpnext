import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { PIPELINE_COLUMNS, type RecruitingItem } from "@/lib/recruiting-kanban";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { RecruitingCard } from "@/components/recruiting/RecruitingCard";

export type PipelineStage = (typeof PIPELINE_COLUMNS)[number]["key"];
export const STAGE_VALUES = PIPELINE_COLUMNS.map((c) => c.key) as PipelineStage[];

type Grouped = Record<PipelineStage, RecruitingItem[]>;
type OpenSheet = ((id: string) => void) | undefined;

function groupByStage(items: RecruitingItem[]): Grouped {
  const grouped = Object.fromEntries(STAGE_VALUES.map((k) => [k, [] as RecruitingItem[]])) as Grouped;
  for (const item of items) grouped[item.stage as PipelineStage]?.push(item);
  return grouped;
}

const REJECTED_KEY = "recruiting-show-rejected";

function EmptyStage({ label }: { label: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">No applicants in {label}</p>;
}

/** Desktop: five columns side by side; Rejected starts collapsed like the design. No drag, as before. */
function DesktopBoard({ grouped, onOpenSheet }: { grouped: Grouped; onOpenSheet: OpenSheet }) {
  const [showRejected, setShowRejectedState] = useState(() => {
    try {
      return localStorage.getItem(REJECTED_KEY) === "1";
    } catch {
      return false; // storage blocked: start collapsed
    }
  });
  function setShowRejected(show: boolean) {
    setShowRejectedState(show);
    try {
      localStorage.setItem(REJECTED_KEY, show ? "1" : "0");
    } catch {
      // storage blocked: the choice just won't persist
    }
  }
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex w-max gap-3">
        {PIPELINE_COLUMNS.map((col) => {
          const items = grouped[col.key];
          const collapsed = col.key === "Rejected" && !showRejected;
          return (
            <section
              key={col.key}
              aria-label={`${col.label}, ${items.length} applicants`}
              className={cn("flex w-[248px] shrink-0 flex-col gap-2.5 rounded-card p-3", col.key === "Rejected" ? "bg-muted" : "bg-secondary")}
            >
              <h2 className="px-1 text-sm font-bold">
                {col.label} <span className="font-medium text-muted-foreground">· {items.length}</span>
              </h2>
              {collapsed ? (
                <button type="button" onClick={() => setShowRejected(true)} className="rounded-md px-1 py-2 text-left text-[13px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Collapsed · show
                </button>
              ) : (
                <div className="flex max-h-[calc(100vh-340px)] flex-col gap-2.5 overflow-y-auto">
                  {items.map((item) => (
                    <RecruitingCard key={item.id} item={item} onOpenSheet={item.stage === "Screening" ? onOpenSheet : undefined} />
                  ))}
                  {items.length === 0 && <EmptyStage label={col.label} />}
                  {col.key === "Rejected" && (
                    <button type="button" onClick={() => setShowRejected(false)} className="rounded-md px-1 py-1 text-left text-[13px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      Hide
                    </button>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Phones: pick one stage, read its applicants as a list. Stage changes happen on the applicant, as on desktop. */
function PhonePipeline({ grouped, active, onChange, onOpenSheet }: {
  grouped: Grouped; active: PipelineStage; onChange: (s: PipelineStage) => void; onOpenSheet: OpenSheet;
}) {
  const current = PIPELINE_COLUMNS.find((c) => c.key === active) ?? PIPELINE_COLUMNS[0];
  return (
    <div>
      <div role="group" aria-label="Pipeline stage" className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {PIPELINE_COLUMNS.map((col) => {
          const selected = col.key === active;
          return (
            <button key={col.key} type="button" aria-pressed={selected} onClick={() => onChange(col.key)} className="flex h-12 shrink-0 items-center focus-visible:outline-none">
              <span className={cn("flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold", selected ? "border-foreground bg-foreground text-background" : "border-input bg-card text-foreground")}>
                {col.label}
                <span className={cn("tabular-nums", selected ? "opacity-80" : "text-muted-foreground")}>· {grouped[col.key].length}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-col gap-2.5">
        {grouped[active].map((item) => (
          <RecruitingCard key={item.id} item={item} onOpenSheet={item.stage === "Screening" ? onOpenSheet : undefined} />
        ))}
        {grouped[active].length === 0 && <EmptyStage label={current.label} />}
      </div>
    </div>
  );
}

export function PipelineBoard({ items, stage, onStageChange, onOpenSheet }: {
  items: RecruitingItem[]; stage: PipelineStage; onStageChange: (s: PipelineStage) => void; onOpenSheet: OpenSheet;
}) {
  const grouped = useMemo(() => groupByStage(items), [items]);
  const desktop = useMediaQuery("(min-width: 768px)");
  return desktop
    ? <DesktopBoard grouped={grouped} onOpenSheet={onOpenSheet} />
    : <PhonePipeline grouped={grouped} active={stage} onChange={onStageChange} onOpenSheet={onOpenSheet} />;
}
