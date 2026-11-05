import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { StaffSummary } from "./types";

interface TileProps {
  label: string;
  value: number;
  note?: string;
  noteClass?: string;
  active?: boolean;
  onClick?: () => void;
}

function Tile({ label, value, note, noteClass, active, onClick }: TileProps) {
  const body: ReactNode = (
    <>
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold tabular-nums md:text-3xl">{value}</div>
      {note && <div className={cn("text-[13px] font-semibold", noteClass)}>{note}</div>}
    </>
  );
  const base = "flex flex-col rounded-2xl border bg-card px-5 py-4 text-left";
  if (!onClick) return <div className={base}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(base, "transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active && "border-foreground")}
    >
      {body}
    </button>
  );
}

interface Props {
  total: number;
  probation: number;
  summary?: StaffSummary;
  view: string;
  onView: (v: string) => void;
}

/** Headcount and probation (click to filter), plus review counts from the backend summary. */
export function StaffKpis({ total, probation, summary, view, onView }: Props) {
  return (
    <section aria-label="Staff summary" className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
      <Tile label="Total staff" value={total} active={view !== "probation"} onClick={() => onView("")} />
      <Tile
        label="On probation"
        value={probation}
        noteClass="text-warning-soft-foreground"
        active={view === "probation"}
        onClick={() => onView("probation")}
      />
      {summary && (
        <>
          <Tile
            label="Reviews overdue"
            value={summary.overdue}
            note={summary.overdue > 0 ? "Incl. never reviewed" : undefined}
            noteClass="text-danger-soft-foreground"
          />
          <Tile label="Reviews due soon" value={summary.due_soon} />
        </>
      )}
    </section>
  );
}
