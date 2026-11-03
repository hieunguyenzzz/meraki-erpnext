import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StaffFilterSelect } from "@/components/projects/StaffFilterSelect";
import type { StaffOption } from "@/lib/projectKanban";
import { cn } from "@/lib/utils";
import type { DateRange } from "./range";

const ANY = "__any__";

interface Props {
  range: DateRange;
  onRange: (r: DateRange) => void;
  onShift: (direction: 1 | -1) => void;
  mode: "upcoming" | "past" | "custom";
  onMode: (m: "upcoming" | "past") => void;
  query: string;
  onQuery: (v: string) => void;
  eventTypes: string[];
  eventType: string;
  onEventType: (v: string) => void;
  weddingTypes: string[];
  weddingType: string;
  onWeddingType: (v: string) => void;
  staffOptions: StaffOption[];
  staff: string;
  onStaff: (v: string) => void;
  myEmployeeId?: string;
}

function Chip({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-10 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold transition-colors max-md:h-12",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-foreground bg-foreground text-background" : "border-input bg-card text-foreground hover:bg-muted",
        className
      )}
    >
      {children}
    </button>
  );
}

const ARROW = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-input bg-card hover:bg-muted max-md:h-12 max-md:w-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Window (upcoming / past / dates), event-type chips, search, wedding type and staff. */
export function EventFilters(p: Props) {
  const isMine = Boolean(p.myEmployeeId) && p.staff === p.myEmployeeId;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Window" className="flex rounded-full bg-secondary p-[3px]">
          {(["upcoming", "past"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={p.mode === m}
              onClick={() => p.onMode(m)}
              className={cn(
                "h-[34px] rounded-full px-4 text-sm font-semibold capitalize transition-colors max-md:h-[42px]",
                p.mode === m ? "bg-card shadow-sm" : "text-muted-foreground"
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="order-2 flex w-full items-center gap-2 md:order-none md:w-auto">
          <Input
            type="date"
            aria-label="From date"
            className="min-w-0 flex-1 md:w-auto md:flex-none"
            value={p.range.from}
            onChange={(e) => e.target.value && p.onRange({ ...p.range, from: e.target.value })}
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label="To date"
            className="min-w-0 flex-1 md:w-auto md:flex-none"
            value={p.range.to}
            onChange={(e) => e.target.value && p.onRange({ ...p.range, to: e.target.value })}
          />
        </div>
        <div className="ml-auto flex gap-2 md:order-last md:ml-0">
          <button type="button" aria-label="Previous window" onClick={() => p.onShift(-1)} className={ARROW}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Next window" onClick={() => p.onShift(1)} className={ARROW}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
        <Chip active={p.eventType === ""} onClick={() => p.onEventType("")}>All types</Chip>
        {p.eventTypes.map((t) => (
          <Chip key={t} active={p.eventType === t} onClick={() => p.onEventType(p.eventType === t ? "" : t)}>{t}</Chip>
        ))}
        {p.myEmployeeId && (
          <Chip active={isMine} onClick={() => p.onStaff(isMine ? "" : p.myEmployeeId!)} className="md:ml-auto">
            Only my events
          </Chip>
        )}
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
        <label className="relative flex md:w-72">
          <span className="sr-only">Search wedding</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="text"
            inputMode="search"
            placeholder="Search wedding"
            value={p.query}
            onChange={(e) => p.onQuery(e.target.value)}
            className="rounded-full pl-11 max-md:pl-11"
          />
        </label>
        <div className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
          {p.weddingTypes.length > 0 && (
            <Select value={p.weddingType || ANY} onValueChange={(v) => p.onWeddingType(v === ANY ? "" : v)}>
              <SelectTrigger aria-label="Wedding type" className="w-auto shrink-0 gap-2 rounded-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All wedding types</SelectItem>
                {p.weddingTypes.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {p.staffOptions.length > 0 && (
            <StaffFilterSelect staff={p.staffOptions} value={p.staff} onChange={p.onStaff} myEmployeeId={p.myEmployeeId} allLabel="All staff" />
          )}
        </div>
      </div>
    </div>
  );
}
