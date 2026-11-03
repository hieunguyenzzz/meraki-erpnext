import { useRef, useState } from "react";
import { CalendarDays, ChevronDown, Heart } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { ExpenseWedding } from "./defaults";

interface Props {
  weddings: ExpenseWedding[];
  project: string;
  onProject: (id: string) => void;
  date: string;
  today: string;
  onDate: (d: string) => void;
}

const pill = "inline-flex h-11 items-center gap-2 rounded-full border border-input bg-card px-4 text-sm font-semibold";

/** Wedding and date, shown as two small pills so the defaults stay out of the way. */
export function ContextRow({ weddings, project, onProject, date, today, onDate }: Props) {
  const [open, setOpen] = useState(false);
  const dateRef = useRef<HTMLInputElement>(null);
  const selected = weddings.find((w) => w.id === project);
  const label = selected ? selected.name : "Office expense";
  const sub = selected?.date === today ? "today" : null;

  const choose = (id: string) => { onProject(id); setOpen(false); };
  const rowClass = "flex h-12 w-full items-center justify-between rounded-lg px-2 text-left text-base hover:bg-muted";

  return (
    <div className="flex items-center gap-2">
      <button type="button" className={cn(pill, "min-w-0 flex-1")} onClick={() => setOpen(true)} aria-label={`Wedding: ${label}. Change`}>
        <Heart className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="truncate">{label}</span>
        {sub && <span className="shrink-0 font-normal text-muted-foreground">· {sub}</span>}
        <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      <div className="relative shrink-0">
        <button type="button" className={pill} onClick={() => dateRef.current?.showPicker?.()} aria-label={`Date: ${date}. Change`}>
          <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
          {date === today ? "Today" : date}
        </button>
        <input
          ref={dateRef}
          type="date"
          value={date}
          max={today}
          aria-label="Expense date"
          onChange={(e) => e.target.value && onDate(e.target.value)}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          tabIndex={-1}
        />
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto p-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))]">
          <SheetHeader><SheetTitle>Wedding</SheetTitle></SheetHeader>
          <ul className="mt-3">
            <li>
              <button type="button" className={rowClass} onClick={() => choose("")}>
                No wedding (office expense)
                {!project && <span className="text-primary">Selected</span>}
              </button>
            </li>
            {weddings.map((w) => (
              <li key={w.id}>
                <button type="button" className={rowClass} onClick={() => choose(w.id)}>
                  <span className="truncate">{w.name}</span>
                  <span className="ml-3 shrink-0 text-sm tabular-nums text-muted-foreground">{w.date ?? ""}</span>
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </div>
  );
}
