import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MONTH_NAMES, type Project } from "./types";

const ALL = "__all__";

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

/** Year / month / wedding (D-ExpenseReport.dc.html). Radix Select can't take "", so "all" is a sentinel converted back here. */
export function ExpenseFilters({ years, months, weddings, year, month, project, onYear, onMonth, onProject }: Props) {
  const back = (fn: (v: string) => void) => (v: string) => fn(v === ALL ? "" : v);
  const label = "flex min-w-0 flex-col gap-1 text-xs font-semibold text-muted-foreground";
  return (
    <div className="grid grid-cols-2 gap-3 md:flex md:flex-wrap md:items-end md:gap-2.5 print:hidden">
      <label className={label}>
        Year
        <Select value={year} onValueChange={onYear}>
          <SelectTrigger aria-label="Year" className="md:w-[120px]"><SelectValue placeholder="Year" /></SelectTrigger>
          <SelectContent>
            {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </label>
      <label className={label}>
        Month
        <Select value={month || ALL} onValueChange={back(onMonth)}>
          <SelectTrigger aria-label="Month" className="md:w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All months</SelectItem>
            {months.map((m) => <SelectItem key={m} value={String(m)}>{MONTH_NAMES[m - 1]}</SelectItem>)}
          </SelectContent>
        </Select>
      </label>
      <label className={`${label} col-span-2`}>
        Wedding
        <Select value={project || ALL} onValueChange={back(onProject)}>
          <SelectTrigger aria-label="Wedding" className="md:w-[260px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All weddings ({weddings.length})</SelectItem>
            {weddings.map((p) => <SelectItem key={p.name} value={p.name}>{p.project_name || p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </label>
    </div>
  );
}
