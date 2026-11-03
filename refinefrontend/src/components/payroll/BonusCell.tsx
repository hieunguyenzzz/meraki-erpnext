import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { MoneyInput } from "@/components/ui/money-input";
import { formatVND } from "@/lib/format";

interface BonusCellProps {
  amount: number;
  editable: boolean;
  /** Phone layout: 48px tap target. */
  touch?: boolean;
  onSave: (amount: number) => Promise<boolean | void>;
}

/** Bonus amount; for draft slips click to edit (Enter/blur saves, Escape cancels). */
export function BonusCell({ amount, editable, touch, onSave }: BonusCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  // After a save, keep showing the new value until the amount prop catches up (no flicker back to the old one).
  const [pending, setPending] = useState<{ value: number; base: number } | null>(null);
  const finished = useRef(false);

  const shown = pending && pending.base === amount ? pending.value : amount;

  if (!editable) return <div className="text-right">{formatVND(amount)}</div>;

  if (saving) {
    return (
      <div className="flex items-center justify-end gap-2 text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        {formatVND(Number(draft || 0))}
      </div>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={`ml-auto block rounded px-1 text-right hover:bg-muted ${touch ? "min-h-12 min-w-12" : ""}`}
        title="Click to set bonus"
        onClick={(e) => {
          e.stopPropagation(); // don't toggle the row's detail expansion
          finished.current = false;
          setDraft(shown > 0 ? String(Math.round(shown)) : "");
          setEditing(true);
        }}
      >
        {formatVND(shown)}
      </button>
    );
  }

  async function commit() {
    if (finished.current) return;
    finished.current = true;
    setEditing(false);
    const next = Number(draft || 0);
    if (next === shown) return;
    setSaving(true);
    try {
      const ok = await onSave(next);
      setPending(ok === false ? null : { value: next, base: amount });
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    finished.current = true;
    setEditing(false);
  }

  return (
    <MoneyInput
      autoFocus
      className={`ml-auto w-32 text-right ${touch ? "h-12" : "h-8"}`}
      placeholder="0"
      value={draft}
      onChange={setDraft}
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") cancel();
      }}
    />
  );
}
