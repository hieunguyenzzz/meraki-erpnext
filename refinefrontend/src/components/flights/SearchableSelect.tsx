import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import type { Option } from "./types";

interface SearchableSelectProps {
  options: Option[];
  value: string;                 // "" = nothing selected
  onChange: (value: string) => void;
  placeholder: string;           // shown when value is ""
  clearLabel?: string;           // when set, adds a leading option that selects ""
  searchPlaceholder?: string;
  className?: string;
}

/** Popover + Command combobox over a flat option list (same pattern as the expense pages). */
export function SearchableSelect({
  options, value, onChange, placeholder, clearLabel, searchPlaceholder = "Search...", className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "flex h-8 min-w-[160px] items-center justify-between gap-2 rounded-md border px-3 text-sm transition-colors",
            "hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring",
            value && clearLabel && "border-primary/40 bg-primary/5",
            className,
          )}
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {selected?.label ?? (value || placeholder)}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {clearLabel && (
                <CommandItem value="__clear__" onSelect={() => pick("")}>
                  <Check className={cn("mr-2 h-4 w-4", value === "" ? "opacity-100" : "opacity-0")} />
                  {clearLabel}
                </CommandItem>
              )}
              {options.map((o) => (
                <CommandItem key={o.value} value={`${o.label} ${o.value}`} onSelect={() => pick(o.value)}>
                  <Check className={cn("mr-2 h-4 w-4", value === o.value ? "opacity-100" : "opacity-0")} />
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
