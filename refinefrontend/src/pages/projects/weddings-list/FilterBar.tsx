import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StaffFilterSelect } from "@/components/projects/StaffFilterSelect";
import { PROJECT_COLUMNS, type ProjectColumnKey, type StaffOption } from "@/lib/projectKanban";
import { cn } from "@/lib/utils";
import { ALL_YEARS } from "./useWeddingFilters";

const ANY = "__any__";

interface Props {
  query: string;
  onQuery: (v: string) => void;
  type: string;
  onType: (v: string) => void;
  year: string;
  onYear: (v: string | null) => void;
  years: string[];
  staff: string;
  onStaff: (v: string) => void;
  staffOptions: StaffOption[];
  myEmployeeId?: string;
  /** Stage chips (with counts) are shown for the list; the board already has a column per stage. */
  showStages: boolean;
  stage: ProjectColumnKey | "";
  onStage: (v: ProjectColumnKey | "") => void;
  stageCounts: Record<ProjectColumnKey, number>;
  total: number;
}

/** Search, filters and stage chips. Selects scroll sideways on phones instead of wrapping. */
export function FilterBar(p: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
        <label className="relative flex md:w-72">
          <span className="sr-only">Search couple</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="text"
            inputMode="search"
            placeholder="Search couple"
            value={p.query}
            onChange={(e) => p.onQuery(e.target.value)}
            className="rounded-full pl-11 max-md:pl-11"
          />
        </label>
        <div className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
          <Select value={p.type || ANY} onValueChange={(v) => p.onType(v === ANY ? "" : v)}>
            <SelectTrigger aria-label="Wedding type" className="w-auto shrink-0 gap-2 rounded-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All types</SelectItem>
              <SelectItem value="HCM">HCM</SelectItem>
              <SelectItem value="Destination">Destination</SelectItem>
            </SelectContent>
          </Select>
          {(
            <Select value={p.year} onValueChange={(v) => p.onYear(v)}>
              <SelectTrigger aria-label="Year" className="w-auto shrink-0 gap-2 rounded-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_YEARS}>All years</SelectItem>
                {p.years.map((y) => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {p.staffOptions.length > 0 && (
            <StaffFilterSelect staff={p.staffOptions} value={p.staff} onChange={p.onStaff} myEmployeeId={p.myEmployeeId} />
          )}
        </div>
      </div>

      {p.showStages && (
        <div role="group" aria-label="Stage" className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          <Chip active={p.stage === ""} onClick={() => p.onStage("")}>All · {p.total}</Chip>
          {PROJECT_COLUMNS.map((c) => (
            <Chip key={c.key} active={p.stage === c.key} onClick={() => p.onStage(c.key)}>
              {c.label} · {p.stageCounts[c.key]}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-10 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold tabular-nums transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-foreground bg-foreground text-background" : "border-input bg-card text-foreground hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}
