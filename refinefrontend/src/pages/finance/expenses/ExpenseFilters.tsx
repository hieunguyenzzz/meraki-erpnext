import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Filters } from "./filters";
import { STATUSES } from "./types";

const ALL = "__all__";

interface Option { value: string; label: string }

interface Props {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  categories: Option[];
  weddings: Option[];
  staff: string[];
  missingCount: number | null;
  isDesktop: boolean;
}

function Pick({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (v: string) => void }) {
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
      <SelectTrigger aria-label={`Filter by ${label.toLowerCase()}`} className="rounded-full max-md:h-12 md:w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}: all</SelectItem>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function ExpenseFilters({ filters: f, onChange, categories, weddings, staff, missingCount, isDesktop }: Props) {
  const [open, setOpen] = useState(false);
  const active = [f.status, f.category, f.wedding, f.staff, f.from, f.to, f.bill].filter(Boolean).length;
  const show = isDesktop || open;

  const controls = (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
      <Pick label="Status" value={f.status ?? ""} options={STATUSES.map((s) => ({ value: s, label: s }))} onChange={(v) => onChange({ status: (v || null) as Filters["status"] })} />
      <Pick label="Category" value={f.category} options={categories} onChange={(v) => onChange({ category: v })} />
      <Pick label="Wedding" value={f.wedding} options={weddings} onChange={(v) => onChange({ wedding: v })} />
      <Pick label="Staff" value={f.staff} options={staff.map((s) => ({ value: s, label: s }))} onChange={(v) => onChange({ staff: v })} />
      <div className="grid grid-cols-2 gap-3 md:flex">
        <Input type="date" aria-label="From date" value={f.from ?? ""} max={f.to ?? undefined} onChange={(e) => onChange({ from: e.target.value || null })} className="rounded-full md:w-40" />
        <Input type="date" aria-label="To date" value={f.to ?? ""} min={f.from ?? undefined} onChange={(e) => onChange({ to: e.target.value || null })} className="rounded-full md:w-40" />
      </div>
      {missingCount !== null && (
        <button
          type="button"
          aria-pressed={f.bill === "missing"}
          onClick={() => onChange({ bill: f.bill === "missing" ? null : "missing" })}
          className={cn(
            "inline-flex h-10 items-center gap-1 rounded-full border px-4 text-sm font-medium max-md:h-12",
            f.bill === "missing" ? "border-warning bg-warning-soft text-warning-soft-foreground" : "bg-card hover:bg-muted",
          )}
        >
          Missing bill · {missingCount}
        </button>
      )}
      {active > 0 && (
        <Button type="button" variant="ghost" onClick={() => onChange({ status: null, category: "", wedding: "", staff: "", from: null, to: null, bill: null })}>
          <X className="mr-1 h-4 w-4" /> Clear filters
        </Button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 md:max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" aria-label="Search expenses" placeholder="Search expenses" value={f.q}
            onChange={(e) => onChange({ q: e.target.value })} className="rounded-full pl-10 max-md:pl-10" />
        </div>
        {!isDesktop && (
          <Button type="button" variant="outline" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="rounded-full">
            <SlidersHorizontal className="mr-1.5 h-4 w-4" /> Filters{active ? ` · ${active}` : ""}
          </Button>
        )}
      </div>
      {show && controls}
    </div>
  );
}

