import { useState } from "react";
import { Check, ChevronsUpDown, Star, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StaffOption } from "@/lib/projectKanban";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface StaffFilterSelectProps {
  staff: StaffOption[];
  value: string;              // "" = all weddings
  onChange: (staffId: string) => void;
  myEmployeeId?: string;
}

/** Filter-bar combobox: pick a staff member to show only their weddings. Read-only view filter. */
export function StaffFilterSelect({
  staff,
  value,
  onChange,
  myEmployeeId,
}: StaffFilterSelectProps) {
  const [open, setOpen] = useState(false);

  const me = myEmployeeId ? staff.find((s) => s.id === myEmployeeId) : undefined;
  const others = me ? staff.filter((s) => s.id !== me.id) : staff;

  const selected = value ? staff.find((s) => s.id === value) : undefined;
  const triggerLabel = value
    ? (me && value === me.id ? `Me · ${me.name}` : selected?.name ?? value)
    : "All weddings";

  function pick(id: string) {
    onChange(id);
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
            "flex h-8 min-w-[180px] items-center justify-between gap-2 rounded-md border px-3 text-sm transition-colors",
            "hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring",
            value && "border-primary/40 bg-primary/5"
          )}
        >
          <span className="flex items-center gap-1.5 truncate">
            <Users className="h-3.5 w-3.5 shrink-0 opacity-60" />
            <span className={cn("truncate", !value && "text-muted-foreground")}>{triggerLabel}</span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search staff..." />
          <CommandList>
            <CommandEmpty>No staff found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__all__" onSelect={() => pick("")}>
                <Check className={cn("mr-2 h-4 w-4", value === "" ? "opacity-100" : "opacity-0")} />
                All weddings
              </CommandItem>
              {me && (
                <CommandItem value={`Me ${me.name} ${me.id}`} onSelect={() => pick(me.id)}>
                  <Check className={cn("mr-2 h-4 w-4", value === me.id ? "opacity-100" : "opacity-0")} />
                  <Star className="mr-1.5 h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  Me · {me.name}
                </CommandItem>
              )}
            </CommandGroup>
            <CommandGroup>
              {others.map((s) => (
                <CommandItem key={s.id} value={`${s.name} ${s.id}`} onSelect={() => pick(s.id)}>
                  <Check className={cn("mr-2 h-4 w-4", value === s.id ? "opacity-100" : "opacity-0")} />
                  {s.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
