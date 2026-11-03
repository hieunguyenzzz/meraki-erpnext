import { useState } from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ComboItem { value: string; label: string; sub?: string }

interface Props {
  label: string;
  value: string;
  items: ComboItem[];
  placeholder: string;
  searchPlaceholder: string;
  onChange: (value: string) => void;
  /** Offer "Clear" when a value is set. */
  clearable?: boolean;
  /** Offer "Create <search>" (quick-expense categories). */
  onCreate?: (name: string) => Promise<void>;
  creating?: boolean;
}

/** Searchable single-choice picker (Popover + Command). */
export function Combo({ label, value, items, placeholder, searchPlaceholder, onChange, clearable, onCreate, creating }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const term = search.trim();
  const shown = items.filter((i) => !term || i.label.toLowerCase().includes(term.toLowerCase()));
  const current = items.find((i) => i.value === value);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={label} className="flex h-10 w-full items-center justify-between rounded-input border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:h-12 max-md:text-base">
          <span className={cn("truncate", !value && "text-muted-foreground")}>{value ? (current?.label ?? value) : placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>
              <div className="py-2 text-center text-sm text-muted-foreground">No match</div>
            </CommandEmpty>
            <CommandGroup>
              {clearable && value && (
                <CommandItem value="__clear__" onSelect={() => { onChange(""); setOpen(false); }}>
                  <X className="mr-2 h-4 w-4" /> Clear
                </CommandItem>
              )}
              {shown.map((i) => (
                <CommandItem key={i.value} value={i.value} onSelect={() => { onChange(i.value); setOpen(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", value === i.value ? "opacity-100" : "opacity-0")} />
                  <div>
                    <p>{i.label}</p>
                    {i.sub && <p className="text-xs text-muted-foreground">{i.sub}</p>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            {onCreate && term && !items.some((i) => i.label.toLowerCase() === term.toLowerCase()) && (
              <CommandGroup heading="Create new">
                <Button type="button" variant="ghost" className="w-full justify-start" disabled={creating}
                  onClick={async () => { await onCreate(term); setOpen(false); }}>
                  <Plus className="mr-2 h-4 w-4" /> {creating ? "Creating..." : `Create "${term}"`}
                </Button>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
