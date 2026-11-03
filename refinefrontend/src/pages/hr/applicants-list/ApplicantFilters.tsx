import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RATINGS, STAGES } from "./types";

const ANY = "__all__"; // Radix Select cannot hold an empty value

interface Option { label: string; value: string }

export interface FilterValues {
  search: string;
  stage: string;
  source: string;
  position: string;
  city: string;
  rating: string;
}

interface Props {
  values: FilterValues;
  onChange: (key: keyof FilterValues, value: string) => void;
  onClear: () => void;
  sources: Option[];
  positions: Option[];
}

function Pill({ label, allLabel, value, onChange, options }: { label: string; allLabel: string; value: string; onChange: (v: string) => void; options: Option[] }) {
  return (
    <Select value={value || ANY} onValueChange={(v) => onChange(v === ANY ? "" : v)}>
      <SelectTrigger aria-label={label} className="w-auto shrink-0 gap-2 rounded-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{allLabel}</SelectItem>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** Search, select pills, city and minimum rating. Pills scroll sideways on phones. */
export function ApplicantFilters({ values, onChange, onClear, sources, positions }: Props) {
  const active = !!(values.search || values.stage || values.source || values.position || values.city || values.rating);
  return (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
      <label className="relative flex md:w-72">
        <span className="sr-only">Search applicants</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="text" inputMode="search" placeholder="Search applicants" value={values.search} onChange={(e) => onChange("search", e.target.value)} className="rounded-full pl-11 max-md:pl-11" />
      </label>
      <div className="scrollbar-hide -mx-4 flex items-center gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
        <Pill label="Stage" allLabel="All stages" value={values.stage} onChange={(v) => onChange("stage", v)} options={STAGES.map((s) => ({ label: s, value: s }))} />
        <Pill label="Position" allLabel="All positions" value={values.position} onChange={(v) => onChange("position", v)} options={positions} />
        <Pill label="Source" allLabel="All sources" value={values.source} onChange={(v) => onChange("source", v)} options={sources} />
        <Pill label="Minimum rating" allLabel="Any rating" value={values.rating} onChange={(v) => onChange("rating", v)} options={RATINGS.map((r) => ({ label: `${r}+ stars`, value: r }))} />
        <label className="shrink-0">
          <span className="sr-only">City</span>
          <Input type="text" placeholder="City" value={values.city} onChange={(e) => onChange("city", e.target.value)} className="w-32 rounded-full" />
        </label>
        {active && (
          <Button variant="ghost" className="shrink-0" onClick={onClear}>
            <X aria-hidden />Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
