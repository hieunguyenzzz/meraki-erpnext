import { useRef, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export interface ComboOption {
  value: string;
  label: string;
}

interface Props {
  id?: string;
  options: ComboOption[];
  /** Selected option value ("" = nothing). */
  value: string;
  /** Label shown when the selection is not (yet) in `options`, e.g. a venue just created. */
  valueLabel?: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  /** What is being created, for the confirm prompt: "venue", "add-on". */
  noun: string;
  onSelect: (option: ComboOption) => void;
  /** Creates a new option from the typed text; resolves false after surfacing a failure through `error`. */
  onCreate: (label: string) => Promise<boolean>;
  error?: string | null;
  onSearchChange?: () => void;
}

/** Search-or-create picker (Popover + Command) used for venues and add-on items. */
export function CreatableCombobox({
  id,
  options,
  value,
  valueLabel,
  placeholder,
  searchPlaceholder,
  emptyText,
  noun,
  onSelect,
  onCreate,
  error,
  onSearchChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const creatingRef = useRef(false);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? valueLabel ?? "";
  const typed = search.trim();
  const canCreate = typed.length > 1 && !options.some((o) => o.label.toLowerCase() === typed.toLowerCase());

  async function create() {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      if (await onCreate(typed)) {
        setOpen(false);
        setSearch("");
      }
      setConfirming(false);
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setConfirming(false); }}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "flex h-12 w-full items-center justify-between gap-2 rounded-input border border-input bg-card px-3.5 text-left text-base transition-colors md:h-10 md:px-3 md:text-sm",
              "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              !selectedLabel && "text-muted-foreground"
            )}
          >
            <span className="truncate">{selectedLabel || placeholder}</span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          {confirming ? (
            <div role="alertdialog" aria-label={`Create ${noun}`} className="flex flex-col gap-3 p-3">
              <p className="text-sm">Create {noun} "{typed}"?</p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirming(false)} disabled={creating}>
                  Cancel
                </Button>
                <Button type="button" className="flex-1" autoFocus onClick={create} disabled={creating}>
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create
                </Button>
              </div>
            </div>
          ) : (
          <Command>
            <CommandInput
              placeholder={searchPlaceholder}
              value={search}
              onValueChange={(v) => {
                setSearch(v);
                onSearchChange?.();
              }}
            />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={`${o.label}__${o.value}`}
                    onSelect={() => {
                      onSelect(o);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === o.value ? "opacity-100" : "opacity-0")} />
                    {o.label}
                  </CommandItem>
                ))}
              </CommandGroup>
              {canCreate && (
                <CommandGroup>
                  {/* Selecting (Enter or click) only asks for confirmation; nothing is created until Create is pressed. */}
                  <CommandItem value={`__create__${typed}`} onSelect={() => setConfirming(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create "{typed}"
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
          )}
        </PopoverContent>
      </Popover>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
