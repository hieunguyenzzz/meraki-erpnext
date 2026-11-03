import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CITY_TABS } from "./cities";

const ANY = "__all__";
const PRICES = ["LOW", "MID", "HIGH", "LUXURY", "UNKNOWN"] as const;

interface Props {
  search: string;
  onSearch: (v: string) => void;
  type: string;
  onType: (v: string) => void;
  typeOptions: string[];
  price: string;
  onPrice: (v: string) => void;
  city: string;
  onCity: (v: string) => void;
  counts: Record<string, number>;
}

/** City chips, search and filters. Chips and selects scroll sideways on phones. */
export function VenuesFilterBar(p: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="City" className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        {CITY_TABS.map((t) => {
          const active = p.city === t.key;
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={active}
              onClick={() => p.onCity(t.key)}
              className={cn(
                "h-10 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold tabular-nums transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "border-foreground bg-foreground text-background" : "border-input bg-card text-foreground hover:bg-muted"
              )}
            >
              {t.label} · {p.counts[t.key] ?? 0}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
        <label className="relative flex md:w-72">
          <span className="sr-only">Search venues</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="text"
            inputMode="search"
            placeholder="Search name or district"
            value={p.search}
            onChange={(e) => p.onSearch(e.target.value)}
            className="rounded-full pl-11 max-md:pl-11"
          />
        </label>
        <div className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
          <Select value={p.type || ANY} onValueChange={(v) => p.onType(v === ANY ? "" : v)}>
            <SelectTrigger aria-label="Venue type" className="w-auto shrink-0 gap-2 rounded-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All types</SelectItem>
              {p.typeOptions.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={p.price || ANY} onValueChange={(v) => p.onPrice(v === ANY ? "" : v)}>
            <SelectTrigger aria-label="Price range" className="w-auto shrink-0 gap-2 rounded-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All prices</SelectItem>
              {PRICES.map((v) => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
