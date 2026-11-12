import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ANY = "__all__";

export interface StaffFilter {
  key: string;
  label: string;
  allLabel: string;
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
}

interface Props {
  search: string;
  onSearch: (v: string) => void;
  placeholder: string;
  filters: StaffFilter[];
}

/** Search pill plus select pills; the selects scroll sideways on phones. */
export function StaffFilterBar({ search, onSearch, placeholder, filters }: Props) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
      <label className="relative flex md:w-72">
        <span className="sr-only">{placeholder}</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="text"
          inputMode="search"
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="rounded-full pl-11 max-md:pl-11"
        />
      </label>
      <div className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
        {filters.map((f) => (
          <Select key={f.key} value={f.value || ANY} onValueChange={(v) => f.onChange(v === ANY ? "" : v)}>
            <SelectTrigger aria-label={f.label} className="w-auto shrink-0 gap-2 rounded-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{f.allLabel}</SelectItem>
              {f.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      </div>
    </div>
  );
}
