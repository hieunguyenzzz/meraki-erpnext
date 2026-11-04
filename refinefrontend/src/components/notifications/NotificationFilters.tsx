import { cn } from "@/lib/utils";

export interface TypeCount {
  type: string;
  total: number;
  unread: number;
}

interface Props {
  types: TypeCount[];
  selected: string; // "" = All
  onSelect: (type: string) => void;
  labelFor: (type: string) => string;
}

/** Pill chips with unread counts; scrolls sideways on phones. */
export function NotificationFilters({ types, selected, onSelect, labelFor }: Props) {
  const allUnread = types.reduce((sum, t) => sum + t.unread, 0);
  const chips = [
    { type: "", label: "All", unread: allUnread },
    ...types.map((t) => ({ type: t.type, label: labelFor(t.type), unread: t.unread })),
  ];

  return (
    <div role="group" aria-label="Filter by type" className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
      {chips.map((chip) => {
        const active = selected === chip.type;
        const isAll = chip.type === "";
        return (
          <button
            key={chip.type || "__all__"}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(chip.type)}
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-[38px]",
              active
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-foreground hover:bg-muted",
            )}
          >
            {chip.label}
            {isAll ? (
              chip.unread > 0 && <span className="opacity-80">· {chip.unread} new</span>
            ) : (
              <span className={cn("text-xs font-semibold", active ? "opacity-80" : "text-muted-foreground", chip.unread === 0 && "max-md:hidden")}>{chip.unread}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
