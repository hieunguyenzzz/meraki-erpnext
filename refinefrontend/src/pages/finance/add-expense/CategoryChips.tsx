import { useRef, useState } from "react";
import { Check, Plus } from "lucide-react";
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
  /** Present only for roles allowed to add categories; resolves to the new category's name. */
  onCreate?: (name: string) => Promise<string>;
}

const chip = "h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors";

/** Recent categories as one-tap chips, with "More" opening the full list (and "New category" for planners). */
export function CategoryChips({ categories, recents, value, onChange, error, onCreate }: Props) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const creatingRef = useRef(false);
  const labels = new Map(categories.map((c) => [c.name, c.account_name]));
  const names = chipNames(categories.map((c) => c.name), recents);
  // A category picked from "More" stays visible as a chip until it becomes a recent.
  const shown = value && !names.includes(value) ? [value, ...names.slice(0, names.length - 1)] : names;

  function openSheet(next: boolean) {
    if (creatingRef.current) return;
    setOpen(next);
    if (!next) { setNewName(""); setCreateError(null); }
  }

  async function create() {
    const name = newName.trim();
    if (!onCreate || !name || creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    setCreateError(null);
    try {
      onChange(await onCreate(name));
      creatingRef.current = false;
      openSheet(false);
    } catch (err) {
      console.error("Add category failed", err);
      setCreateError(err instanceof Error ? err.message : "Could not add the category");
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }

  return (
    <div>
      <div id="expense-category" role="group" aria-label="Category" className="flex flex-wrap gap-2">
        {shown.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            aria-describedby={error ? "expense-category-error" : undefined}
            onClick={() => onChange(n)}
            className={cn(chip, value === n ? "border-foreground bg-foreground text-background" : "border-input bg-card text-foreground")}
          >
            {labels.get(n) ?? n}
          </button>
        ))}
        {(categories.length > shown.length || onCreate) && (
          <button type="button" onClick={() => openSheet(true)} className={cn(chip, "border-dashed border-input bg-transparent text-primary")}>
            More
          </button>
        )}
      </div>
      {error && <p id="expense-category-error" role="alert" className="mt-2 text-sm text-destructive">{error}</p>}

      <Sheet open={open} onOpenChange={openSheet}>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto p-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))]">
          <SheetHeader><SheetTitle>Category</SheetTitle></SheetHeader>
          {onCreate && (
            <div className="mt-3">
              <div className="flex gap-2">
                <input
                  value={newName}
                  onChange={(e) => { setNewName(e.target.value); setCreateError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void create(); } }}
                  placeholder="New category, e.g. Hoa"
                  aria-label="New category name"
                  maxLength={140}
                  disabled={creating}
                  className="h-12 min-w-0 flex-1 rounded-input border border-input bg-card px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <button
                  type="button"
                  onClick={() => void create()}
                  disabled={creating || !newName.trim()}
                  className="inline-flex h-12 shrink-0 items-center gap-1 rounded-full bg-primary-fill px-4 text-sm font-semibold text-primary-fill-foreground disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  {creating ? "Adding…" : "Add"}
                </button>
              </div>
              {createError && <p role="alert" className="mt-2 text-sm text-destructive">{createError}</p>}
            </div>
          )}
          <ul className="mt-3">
            {categories.map((c) => (
              <li key={c.name}>
                <button
                  type="button"
                  onClick={() => { onChange(c.name); openSheet(false); }}
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
