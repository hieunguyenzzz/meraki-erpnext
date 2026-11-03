import { useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { orderWeddings, searchWeddings, type ExpenseWedding } from "./defaults";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weddings: ExpenseWedding[];
  assignedIds: Set<string>;
  today: string;
  project: string;
  onChoose: (id: string) => void;
}

const MAX_SHOWN = 50;
const row = "flex h-12 w-full items-center justify-between rounded-lg px-2 text-left text-base hover:bg-muted";

/** Wedding picker with accent-insensitive search; the list is capped so years of weddings stay fast. */
export function WeddingSheet({ open, onOpenChange, weddings, assignedIds, today, project, onChoose }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const ordered = useMemo(() => orderWeddings(weddings, assignedIds, today), [weddings, assignedIds, today]);
  const matches = useMemo(() => searchWeddings(ordered, query), [ordered, query]);
  const shown = matches.slice(0, MAX_SHOWN);

  const clear = () => { setQuery(""); inputRef.current?.focus(); };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) setQuery(""); onOpenChange(o); }}>
      <SheetContent
        side="bottom"
        className="flex h-[75dvh] max-h-[75dvh] flex-col p-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))]"
        onOpenAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus(); }}
      >
        <SheetHeader><SheetTitle>Wedding</SheetTitle></SheetHeader>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search couple or venue"
            aria-label="Search couple or venue"
            autoComplete="off"
            className="h-12 w-full rounded-input border border-input bg-card pl-9 pr-11 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button type="button" aria-label="Clear search" onClick={clear} className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center text-muted-foreground">
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>

        <button type="button" className={`${row} mt-2`} onClick={() => onChoose("")}>
          No wedding (office expense)
          {!project && <span className="text-primary">Selected</span>}
        </button>

        <ul className="mt-1 min-h-0 flex-1 overflow-y-auto">
          {shown.map((w) => (
            <li key={w.id}>
              <button type="button" className={row} onClick={() => onChoose(w.id)}>
                <span className="min-w-0">
                  <span className="block truncate">{w.name}</span>
                  {w.venue && <span className="block truncate text-xs text-muted-foreground">{w.venue}</span>}
                </span>
                <span className="ml-3 shrink-0 text-sm tabular-nums text-muted-foreground">{w.date ?? ""}</span>
              </button>
            </li>
          ))}
          {weddings.length === 0 && !query && (
            <li className="py-6 text-center text-sm text-muted-foreground">No weddings assigned to you yet</li>
          )}
          {matches.length === 0 && (weddings.length > 0 || query) && (
            <li className="flex flex-col items-center gap-1 py-6 text-center text-sm text-muted-foreground">
              No weddings match
              <button type="button" onClick={clear} className="h-11 px-4 font-semibold text-primary">Clear search</button>
            </li>
          )}
          {matches.length > MAX_SHOWN && (
            <li className="py-3 text-center text-sm text-muted-foreground">Keep typing to narrow down ({matches.length - MAX_SHOWN} more)</li>
          )}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
