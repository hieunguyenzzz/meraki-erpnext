import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MONTH_LABELS, type Project } from "./types";

const NONE = "__none__";

interface Props {
  years: string[];
  months: number[];
  weddings: Project[];
  year: string;
  month: string;
  project: string;
  onYear: (v: string) => void;
  onMonth: (v: string) => void;
  onProject: (v: string) => void;
}

/** Year / month / wedding. Radix Select can't take "", so "none" is a sentinel converted back here. */
export function ExpenseFilters({ years, months, weddings, year, month, project, onYear, onMonth, onProject }: Props) {
  const back = (fn: (v: string) => void) => (v: string) => fn(v === NONE ? "" : v);
  return (
    <div className="grid grid-cols-[0.8fr_0.8fr_1.4fr] gap-2 md:flex md:flex-wrap">
      <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground md:contents">
        <span className="md:sr-only">Year</span>
        <Select value={year || NONE} onValueChange={back(onYear)}>
          <SelectTrigger aria-label="Year" className="md:w-[120px]"><SelectValue placeholder="Year" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All years</SelectItem>
            {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground md:contents">
        <span className="md:sr-only">Month</span>
        <Select value={month || NONE} onValueChange={back(onMonth)} disabled={!year}>
          <SelectTrigger aria-label="Month" className="md:w-[130px]"><SelectValue placeholder="Month" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All months</SelectItem>
            {months.map((m) => <SelectItem key={m} value={String(m)}>{MONTH_LABELS[m - 1]}</SelectItem>)}
          </SelectContent>
        </Select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground md:contents">
        <span className="md:sr-only">Wedding</span>
        <Select value={project || NONE} onValueChange={back(onProject)}>
          <SelectTrigger aria-label="Wedding" className="md:w-[280px]"><SelectValue placeholder="Select wedding..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Select wedding...</SelectItem>
            {weddings.map((p) => <SelectItem key={p.name} value={p.name}>{p.project_name || p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </label>
    </div>
  );
}
