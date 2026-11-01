import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/money-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatVND } from "@/lib/format";

interface BonusCellProps {
  amount: number;
  editable: boolean;
  onSave: (amount: number) => Promise<void>;
}

/** Bonus amount; for draft slips click to edit in a popover (Enter/Save saves, Escape/outside click cancels). */
export function BonusCell({ amount, editable, onSave }: BonusCellProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  if (!editable) return <div className="text-right">{formatVND(amount)}</div>;

  function handleOpenChange(next: boolean) {
    if (next) setDraft(amount > 0 ? String(Math.round(amount)) : "");
    setOpen(next);
  }

  async function save() {
    const next = Number(draft || 0);
    if (next === amount) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="ml-auto block rounded px-1 text-right hover:bg-muted"
          title="Click to set bonus"
          onClick={(e) => e.stopPropagation()} // don't toggle the row's detail expansion
        >
          {formatVND(amount)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 space-y-2 p-3" onClick={(e) => e.stopPropagation()}>
        <div className="text-xs font-medium text-muted-foreground">Bonus</div>
        <MoneyInput
          autoFocus
          className="h-8 w-full text-right"
          placeholder="0"
          value={draft}
          onChange={setDraft}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !saving) save();
          }}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={saving} onClick={save}>
            {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
