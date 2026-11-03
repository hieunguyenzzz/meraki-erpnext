import { useEffect, useRef, useState } from "react";
import { useInvalidate } from "@refinedev/core";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { todayVN } from "@/lib/businessTime";
import { Combo } from "./Combo";
import { responseError, type ExpenseCategory } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weddings: { value: string; label: string; sub?: string }[];
  isDesktop: boolean;
  /** The page's full category list changed (a category was created). */
  onCategoryCreated: () => void;
}

const blank = () => ({ date: todayVN(), description: "", amount: "", category: "", wedding: "" });

/** Finance-only quick expense: created already approved and paid (POST /expense/quick). */
export function QuickExpenseSheet({ open, onOpenChange, weddings, isDesktop, onCategoryCreated }: Props) {
  const invalidate = useInvalidate();
  const [form, setForm] = useState(blank);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const busy = useRef(false);
  const closeTimer = useRef<number | undefined>(undefined);

  // Wedding categories when linked to a wedding, otherwise all of them.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(`/inquiry-api/expense/categories${form.wedding ? "?scope=wedding" : ""}`, { credentials: "include", signal: controller.signal })
      .then(async (r) => { if (!r.ok) throw await responseError(r, "Could not load categories"); return r.json() as Promise<ExpenseCategory[]>; })
      .then((data) => {
        setCategories(data);
        setForm((prev) => (data.some((c) => c.name === prev.category) ? prev : { ...prev, category: "" }));
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        console.error("Quick expense categories failed", err);
        setError(err instanceof Error ? err.message : "Could not load categories");
      });
    return () => controller.abort();
  }, [open, form.wedding]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  function close() {
    window.clearTimeout(closeTimer.current);
    onOpenChange(false);
    setForm(blank());
    setError(null);
    setSuccess(null);
  }

  async function createCategory(name: string) {
    setCreating(true);
    try {
      const res = await fetch("/inquiry-api/expense/categories", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scope: form.wedding ? "wedding" : "office" }),
      });
      if (!res.ok) throw await responseError(res, "Failed to create category");
      const created: ExpenseCategory = await res.json();
      setCategories((prev) => [...prev, created]);
      setForm((prev) => ({ ...prev, category: created.name }));
      onCategoryCreated();
    } catch (err) {
      console.error("Create category failed", err);
      setError(err instanceof Error ? err.message : "Failed to create category");
    } finally {
      setCreating(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount);
    if (busy.current || !form.description.trim() || !form.amount || !form.category) return;
    if (amount <= 0) { setError("Amount must be greater than 0"); return; }
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/inquiry-api/expense/quick", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: form.date, description: form.description, amount, account: form.category, project: form.wedding || null }),
      });
      if (!res.ok) throw await responseError(res, "Failed to create expense");
      const created = await res.json();
      setSuccess(`Expense ${created.purchase_invoice} created`);
      invalidate({ resource: "Purchase Invoice", invalidates: ["list"] });
      closeTimer.current = window.setTimeout(close, 1500);
    } catch (err) {
      console.error("Quick expense failed", err);
      setError(err instanceof Error ? err.message : "Failed to create expense");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <SheetContent side={isDesktop ? "right" : "bottom"} className="flex max-h-[92dvh] flex-col p-0 md:max-h-none md:sm:max-w-lg">
        <SheetHeader className="shrink-0 border-b px-6 py-4">
          <SheetTitle className="font-display text-2xl">Quick expense</SheetTitle>
          <p className="text-sm text-muted-foreground">Saved as approved and paid straight away. For a receipt that needs approval, use Add expense.</p>
        </SheetHeader>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {error && <div role="alert" className="flex items-center gap-2 rounded-md bg-danger-soft p-3 text-sm text-danger-soft-foreground"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
            {success && <div role="status" className="flex items-center gap-2 rounded-md bg-success-soft p-3 text-sm text-success-soft-foreground"><CheckCircle2 className="h-4 w-4 shrink-0" />{success}</div>}
            <div className="space-y-2">
              <Label htmlFor="quick-date">Date *</Label>
              <Input id="quick-date" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-description">Description *</Label>
              <Input id="quick-description" required placeholder="e.g. Office supplies" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-amount">Amount (VND) *</Label>
              <MoneyInput id="quick-amount" required placeholder="500.000" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
            </div>
            <div className="space-y-2">
              <Label>Category *</Label>
              <Combo label="Category" value={form.category} placeholder="Search categories..." searchPlaceholder="Search or create..."
                items={categories.map((c) => ({ value: c.name, label: c.account_name }))}
                onChange={(v) => setForm({ ...form, category: v })} onCreate={createCategory} creating={creating} />
            </div>
            <div className="space-y-2">
              <Label>Wedding (optional)</Label>
              <Combo label="Wedding" value={form.wedding} placeholder="Link to a wedding..." searchPlaceholder="Search weddings..."
                items={weddings} clearable onChange={(v) => setForm({ ...form, wedding: v })} />
            </div>
          </div>
          <SheetFooter className="shrink-0 gap-2 border-t px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.description.trim() || !form.amount || !form.category || !!success}>{saving ? "Creating..." : "Create expense"}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
