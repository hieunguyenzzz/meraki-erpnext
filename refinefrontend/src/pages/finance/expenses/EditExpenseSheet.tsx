import { useRef, useState } from "react";
import { useInvalidate, useOne } from "@refinedev/core";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { categoryLabel, isoDay, responseError, type Expense, type ExpenseCategory, type RowInfo } from "./types";

interface Props {
  expense: Expense | null;
  info?: RowInfo;
  categories: ExpenseCategory[];
  weddingName?: string;
  isDesktop: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/** Edit amount / date / category / description. The caller mounts it with key={expense.name} so state resets per expense. */
export function EditExpenseSheet({ expense, info, categories, weddingName, isDesktop, onClose, onSaved }: Props) {
  const invalidate = useInvalidate();
  const initialDescription = info?.description ?? "";
  // Keep exactly what ERPNext stores (no rounding here); the amount is only sent unchanged unless edited.
  const initialAmount = expense ? String(expense.grand_total) : "";
  const initialDate = expense ? isoDay(expense.posting_date) : "";
  const initialAccount = expense?.against_expense_account ?? "";
  const [amount, setAmount] = useState(initialAmount);
  const [date, setDate] = useState(initialDate);
  const [account, setAccount] = useState(initialAccount);
  const [description, setDescription] = useState(initialDescription);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  // The backend rewrites the first line only, so a multi-line invoice must not be saved from here.
  const { result: doc, query } = useOne({ resource: "Purchase Invoice", id: expense?.name ?? "", queryOptions: { enabled: !!expense } });
  const lineCount = (doc?.items ?? []).length;
  const multiLine = lineCount > 1;

  const dirty = amount !== initialAmount || date !== initialDate || account !== initialAccount
    || (description.trim() !== "" && description.trim() !== initialDescription.trim());

  const options = categories.some((c) => c.name === account) || !account
    ? categories
    : [{ name: account, account_name: categoryLabel(account) }, ...categories];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!expense || busy.current || !amount || Number(amount) <= 0 || !dirty || multiLine || !doc) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/inquiry-api/expense/${encodeURIComponent(expense.name)}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // The backend requires an amount, so it is always sent (unchanged when not edited).
          amount: Number(amount),
          // Only changed fields are sent; null keeps the stored value. The description prefill has the
          // category prefix stripped, so echoing it back unchanged would rewrite the stored item name.
          description: description.trim() && description.trim() !== initialDescription.trim() ? description.trim() : null,
          date: date && date !== initialDate ? date : null,
          account: account && account !== initialAccount ? account : null,
        }),
      });
      if (!res.ok) throw await responseError(res, "Failed to update expense");
      invalidate({ resource: "Purchase Invoice", invalidates: ["list", "detail"] });
      invalidate({ resource: "File", invalidates: ["list"] });
      onSaved();
    } catch (err) {
      console.error("Edit expense failed", expense.name, err);
      setError(err instanceof Error ? err.message : "Failed to update expense");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <Sheet open={!!expense} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <SheetContent side={isDesktop ? "right" : "bottom"} className="flex max-h-[92dvh] flex-col p-0 md:max-h-none md:sm:max-w-md">
        <SheetHeader className="shrink-0 border-b px-6 py-4">
          <SheetTitle className="font-display text-2xl">Edit expense</SheetTitle>
          {expense && <p className="text-sm text-muted-foreground">{expense.name}{weddingName ? ` · ${weddingName}` : ""}</p>}
        </SheetHeader>
        <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {error && (
              <div role="alert" className="flex items-center gap-2 rounded-md bg-danger-soft p-3 text-sm text-danger-soft-foreground">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </div>
            )}
            {query.isError && (
              <div role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger-soft-foreground">Couldn't load this expense, so it can't be saved right now.</div>
            )}
            {multiLine && (
              <div role="alert" className="rounded-md bg-warning-soft p-3 text-sm text-warning-soft-foreground">
                This invoice has {lineCount} lines. Editing here would collapse it to one line, so it can't be changed from this screen.
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-amount">Amount (VND) *</Label>
              {Number.isInteger(Number(initialAmount)) ? (
                <MoneyInput id="edit-amount" required value={amount} onChange={setAmount} className="font-semibold tabular-nums" />
              ) : (
                <Input id="edit-amount" required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className="font-semibold tabular-nums" />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-date">Date</Label>
              <Input id="edit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={account} onValueChange={setAccount}>
                <SelectTrigger aria-label="Category"><SelectValue placeholder="Keep existing" /></SelectTrigger>
                <SelectContent>
                  {options.map((c) => <SelectItem key={c.name} value={c.name}>{c.account_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Input id="edit-description" value={description} placeholder="Leave empty to keep existing" onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
          <SheetFooter className="shrink-0 gap-2 border-t px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !amount || Number(amount) <= 0 || !dirty || !doc || multiLine}>{saving ? "Saving..." : "Save changes"}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
