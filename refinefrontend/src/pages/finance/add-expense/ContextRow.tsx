import { useState } from "react";
import { CalendarDays, ChevronDown, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExpenseWedding } from "./defaults";
import { WeddingSheet } from "./WeddingSheet";

interface Props {
  weddings: ExpenseWedding[];
  assignedIds: Set<string>;
  project: string;
  onProject: (id: string) => void;
  date: string;
  today: string;
  onDate: (d: string) => void;
}

const pill = "inline-flex h-11 items-center gap-2 rounded-full border border-input bg-card px-4 text-sm font-semibold";

/** Wedding and date, shown as two small pills so the defaults stay out of the way. */
export function ContextRow({ weddings, assignedIds, project, onProject, date, today, onDate }: Props) {
  const [open, setOpen] = useState(false);
  const selected = weddings.find((w) => w.id === project);
  const label = selected ? selected.name : "Office expense";
  const sub = selected?.date === today ? "today" : null;

  const choose = (id: string) => { onProject(id); setOpen(false); };

  return (
    <div className="flex items-center gap-2">
      <button type="button" className={cn(pill, "min-w-0 flex-1")} onClick={() => setOpen(true)} aria-label={`Wedding: ${label}. Change`}>
        <Heart className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="truncate">{label}</span>
        {sub && <span className="shrink-0 font-normal text-muted-foreground">· {sub}</span>}
        <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {/* A real date input sits transparently over the pill, so the tap works everywhere; showPicker is an enhancement. */}
      <div className={cn(pill, "relative shrink-0 focus-within:ring-2 focus-within:ring-ring")}>
        <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
        {date === today ? "Today" : date}
        <input
          type="date"
          value={date}
          max={today}
          aria-label={`Expense date: ${date}`}
          onChange={(e) => e.target.value && onDate(e.target.value)}
          onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* picker already open or unsupported */ } }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>

      <WeddingSheet open={open} onOpenChange={setOpen} weddings={weddings} assignedIds={assignedIds} today={today} project={project} onChoose={choose} />
    </div>
  );
}
