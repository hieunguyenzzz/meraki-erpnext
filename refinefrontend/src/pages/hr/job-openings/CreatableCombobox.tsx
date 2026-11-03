import { useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

interface Props {
  label: string;
  required?: boolean;
  value: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  options: string[];
  creating: boolean;
  onSelect: (name: string) => void;
  onCreate: (name: string) => Promise<boolean>;
}

/** Pick an existing record or create it from what was typed (used for Designation and Branch). */
export function CreatableCombobox({ label, required, value, placeholder, searchPlaceholder, emptyText, options, creating, onSelect, onCreate }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  return (
    <div className="space-y-1.5">
      <Label>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "flex h-10 w-full items-center justify-between rounded-input border border-input bg-card px-3 text-sm transition-colors max-md:h-12 max-md:text-base",
              "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              !value && "text-muted-foreground",
            )}
          >
            <span className="truncate">{value || placeholder}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem key={o} value={o} onSelect={() => { onSelect(o); setOpen(false); }}>
                    <Check className={cn("mr-2 h-4 w-4", value === o ? "opacity-100" : "opacity-0")} />
                    {o}
                  </CommandItem>
                ))}
              </CommandGroup>
              {search.length > 1 && !options.some((o) => o.toLowerCase() === search.toLowerCase()) && (
                <CommandGroup>
                  <CommandItem
                    value={`__create__${search}`}
                    disabled={creating}
                    onSelect={async () => {
                      if (await onCreate(search)) { setOpen(false); setSearch(""); }
                    }}
                  >
                    {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                    Create "{search}"
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
