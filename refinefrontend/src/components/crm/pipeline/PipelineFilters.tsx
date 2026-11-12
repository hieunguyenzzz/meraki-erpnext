import { useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { ArrowDown, ArrowUp, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const WAITING_VALUES = ["all", "client", "staff"] as const;
export const SORT_VALUES = ["newest", "oldest"] as const;
export type WaitingFilter = (typeof WAITING_VALUES)[number];
export type SortOrder = (typeof SORT_VALUES)[number];

interface Props {
  waitingFilter: WaitingFilter;
  onWaitingFilterChange: (filter: WaitingFilter) => void;
  locationFilter: string | null;
  onLocationFilterChange: (location: string | null) => void;
  locations: string[];
  sortOrder: SortOrder;
  onSortOrderChange: (order: SortOrder) => void;
}

const ALL_LOCATIONS = "__all__"; // Radix Select cannot hold an empty value

const WAITING_OPTIONS: { value: WaitingFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "client", label: "Client reply" },
  { value: "staff", label: "Our action" },
];

function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:h-12",
        active ? "border-accent bg-accent text-accent-foreground" : "border-input bg-card text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function Controls({ waitingFilter, onWaitingFilterChange, locationFilter, onLocationFilterChange, locations, sortOrder, onSortOrderChange }: Props) {
  const SortIcon = sortOrder === "newest" ? ArrowDown : ArrowUp;
  return (
    <>
      <div role="group" aria-label="Awaiting" className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Awaiting</span>
        {WAITING_OPTIONS.map((o) => (
          <Chip key={o.value} active={waitingFilter === o.value} onClick={() => onWaitingFilterChange(o.value)}>{o.label}</Chip>
        ))}
      </div>
      <Select value={locationFilter ?? ALL_LOCATIONS} onValueChange={(v) => onLocationFilterChange(v === ALL_LOCATIONS ? null : v)}>
        <SelectTrigger aria-label="Location" className="h-10 w-full rounded-full md:w-[190px] max-md:h-12">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_LOCATIONS}>All locations</SelectItem>
          {locations.map((loc) => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
        </SelectContent>
      </Select>
      <Chip onClick={() => onSortOrderChange(sortOrder === "newest" ? "oldest" : "newest")}>
        <SortIcon className="h-3.5 w-3.5" aria-hidden />
        {sortOrder === "newest" ? "Recent first" : "Oldest first"}
      </Chip>
    </>
  );
}

/** Awaiting / location / sort: inline on desktop, behind one button and a bottom sheet on phones. */
export function PipelineFilters(props: Props) {
  const [open, setOpen] = useState(false);
  const desktop = useMediaQuery("(min-width: 768px)");
  const active = (props.waitingFilter !== "all" ? 1 : 0) + (props.locationFilter ? 1 : 0);
  const clear = () => { props.onWaitingFilterChange("all"); props.onLocationFilterChange(null); };

  if (desktop) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Controls {...props} />
        {active > 0 && (
          <Button variant="ghost" size="sm" onClick={clear}><X aria-hidden />Clear filters</Button>
        )}
      </div>
    );
  }

  return (
    <>
      <div>
        <Button variant="outline" className="w-full justify-between" onClick={() => setOpen(true)}>
          <span className="flex items-center gap-2"><SlidersHorizontal aria-hidden />Filters and sort</span>
          {active > 0 && <span className="rounded-full bg-primary-fill px-2 text-xs text-primary-fill-foreground">{active}</span>}
        </Button>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="flex flex-col gap-4 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <SheetHeader><SheetTitle>Filters and sort</SheetTitle><SheetDescription className="sr-only">Narrow the pipeline by who is waiting, location and order.</SheetDescription></SheetHeader>
            <Controls {...props} />
            <div className="flex gap-2">
              {active > 0 && <Button variant="outline" className="flex-1" onClick={clear}>Clear filters</Button>}
              <Button className="flex-1" onClick={() => setOpen(false)}>Done</Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
