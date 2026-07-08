import { useState } from "react";
import { useUpdate } from "@refinedev/core";
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
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

export interface PlannerEmployee {
  name: string;
  employee_name: string;
  first_name?: string;
  last_name?: string;
}

/** Mirror of the backend `_display_name()` helper (projects.py): first name only. */
function displayName(emp: PlannerEmployee): string {
  return emp.first_name || emp.employee_name || emp.name;
}

interface PlannerCellProps {
  projectId: string;
  field: string;
  currentId?: string;
  currentName?: string;
  employees: PlannerEmployee[];
  onUpdated: (projectId: string, field: string, newId: string | null, newName: string) => void;
}

export function PlannerCell({
  projectId,
  field,
  currentId,
  currentName,
  employees,
  onUpdated,
}: PlannerCellProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const { mutateAsync: updateRecord, mutation } = useUpdate({ successNotification: false });
  const isSaving = mutation.isPending;

  async function assign(newId: string | null, newName: string) {
    setOpen(false);
    setError(false);
    try {
      await updateRecord({
        resource: "Project",
        id: projectId,
        values: { [field]: newId },
      });
      onUpdated(projectId, field, newId, newName);
    } catch {
      setError(true);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={isSaving}
          className={cn(
            "group flex w-full min-w-[130px] items-center justify-between gap-1 rounded-md border border-transparent px-2 py-1 text-sm transition-colors",
            "hover:border-input hover:bg-muted/50 focus:outline-none disabled:opacity-60",
            error && "border-destructive"
          )}
        >
          <span className={cn(!currentName && "text-muted-foreground")}>
            {currentName || "—"}
          </span>
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin opacity-70" />
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-50" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search staff..." />
          <CommandList>
            <CommandEmpty>No staff found.</CommandEmpty>
            {currentId && (
              <CommandGroup>
                <CommandItem
                  value="__unassign__"
                  onSelect={() => assign(null, "")}
                  className="text-muted-foreground"
                >
                  <X className="mr-2 h-4 w-4" />
                  Unassign
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {employees.map((emp) => {
                const label = displayName(emp);
                return (
                  <CommandItem
                    key={emp.name}
                    value={label}
                    onSelect={() => assign(emp.name, label)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        currentId === emp.name ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
