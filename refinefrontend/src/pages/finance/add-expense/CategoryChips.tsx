import { useState } from "react";
import { Check } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { chipNames } from "./defaults";
import type { ExpenseCategory } from "./api";

interface Props {
  categories: ExpenseCategory[];
  recents: string[];
  value: string;
  onChange: (name: string) => void;
  error?: string;
}

const chip = "h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors";

/** Recent categories as one-tap chips, with "More" opening the full list. */
export function CategoryChips({ categories, recents, value, onChange, error }: Props) {
  const [open, setOpen] = useState(false);
  const labels = new Map(categories.map((c) => [c.name, c.account_name]));
  const names = chipNames(categories.map((c) => c.name), recents);
  // A category picked from "More" stays visible as a chip until it becomes a recent.
  const shown = value && !names.includes(value) ? [value, ...names.slice(0, names.length - 1)] : names;

  return (
    <div>
      <div role="radiogroup" aria-label="Category" className="flex flex-wrap gap-2">
        {shown.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(n)}
            className={cn(chip, value === n ? "border-foreground bg-foreground text-background" : "border-input bg-card text-foreground")}
          >
            {labels.get(n) ?? n}
          </button>
        ))}
        {categories.length > shown.length && (
          <button type="button" onClick={() => setOpen(true)} className={cn(chip, "border-dashed border-input bg-transparent text-primary")}>
            More
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto p-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))]">
          <SheetHeader><SheetTitle>Category</SheetTitle></SheetHeader>
          <ul className="mt-3">
            {categories.map((c) => (
              <li key={c.name}>
                <button
                  type="button"
                  onClick={() => { onChange(c.name); setOpen(false); }}
                  className="flex h-12 w-full items-center justify-between rounded-lg px-2 text-left text-base hover:bg-muted"
                >
                  {c.account_name}
                  {value === c.name && <Check className="h-5 w-5 text-primary" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </div>
  );
}
