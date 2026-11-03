import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  search: string;
  onSearch: (v: string) => void;
  category: string;
  onCategory: (v: string) => void;
  categories: { name: string; count: number }[];
  total: number;
}

/** Search plus category chips (the old category select); chips scroll sideways on phones. */
export function VendorsFilterBar({ search, onSearch, category, onCategory, categories, total }: Props) {
  const chip = (key: string, label: string, count: number) => {
    const active = category === key;
    return (
      <button
        key={key}
        type="button"
        aria-pressed={active}
        onClick={() => onCategory(key)}
        className={cn(
          "h-10 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold tabular-nums transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active ? "border-foreground bg-foreground text-background" : "border-input bg-card text-foreground hover:bg-muted"
        )}
      >
        {label} · {count}
      </button>
    );
  };
  return (
    <div className="flex flex-col gap-3">
      <label className="relative flex md:w-72">
        <span className="sr-only">Search vendors</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="text"
          inputMode="search"
          placeholder="Search vendors"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="rounded-full pl-11 max-md:pl-11"
        />
      </label>
      <div role="group" aria-label="Category" className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        {chip("", "All", total)}
        {categories.map((c) => chip(c.name, c.name, c.count))}
      </div>
    </div>
  );
}
