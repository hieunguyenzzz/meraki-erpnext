import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { COLUMNS, type ColumnKey } from "@/lib/kanban";

/** "Change stage" menu: the six pipeline stages, the current one highlighted. */
export function StageMenu({ current, disabled, onPick }: {
  current: ColumnKey; disabled?: boolean; onPick: (key: ColumnKey) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          Change stage <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 rounded-card p-1.5">
        {COLUMNS.map((c) => (
          <DropdownMenuItem
            key={c.key}
            onSelect={() => c.key !== current && onPick(c.key)}
            className={cn("h-10 px-3 text-sm", c.key === current ? "bg-accent font-bold" : "font-medium")}
          >
            {c.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
