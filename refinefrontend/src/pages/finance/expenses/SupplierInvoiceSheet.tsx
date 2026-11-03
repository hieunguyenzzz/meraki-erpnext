import { useEffect, useRef, useState } from "react";
import { useInvalidate, useList } from "@refinedev/core";
import { AlertCircle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { todayVN } from "@/lib/businessTime";
import { formatVNDFull } from "@/lib/format";
import { responseError, type ExpenseCategory } from "./types";

interface Line { description: string; category: string; amount: string }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ExpenseCategory[];
  isDesktop: boolean;
}

const blankLine = (): Line => ({ description: "", category: "", amount: "" });
const blank = () => ({ supplier: "", date: todayVN(), items: [blankLine()] });

/** Multi-line supplier invoice (POST /expense/supplier-invoice). */
export function SupplierInvoiceSheet({ open, onOpenChange, categories, isDesktop }: Props) {
  const invalidate = useInvalidate();
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const busy = useRef(false);
  const closeTimer = useRef<number | undefined>(undefined);

  const { result } = useList({
    resource: "Supplier",
    pagination: { mode: "off" },
    meta: { fields: ["name", "supplier_name"] },
    queryOptions: { enabled: open },
  });
  const suppliers = (result?.data ?? []) as { name: string; supplier_name: string }[];

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  function close() {
    window.clearTimeout(closeTimer.current);
    onOpenChange(false);
    setForm(blank());
    setError(null);
    setSuccess(null);
  }

  const setLine = (i: number, patch: Partial<Line>) =>
    setForm((f) => ({ ...f, items: f.items.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));
  const total = form.items.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const incomplete = !form.supplier || form.items.some((l) => !l.description.trim() || !l.category || !l.amount);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy.current || incomplete) return;
    if (form.items.some((l) => Number(l.amount) <= 0)) { setError("All amounts must be greater than 0"); return; }
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/inquiry-api/expense/supplier-invoice", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier: form.supplier,
          date: form.date,
          items: form.items.map((l) => ({ description: l.description, account: l.category, amount: Number(l.amount) })),
        }),
      });
      if (!res.ok) throw await responseError(res, "Failed to create invoice");
      const created = await res.json();
      setSuccess(`Purchase Invoice ${created.purchase_invoice} created`);
      invalidate({ resource: "Purchase Invoice", invalidates: ["list"] });
      closeTimer.current = window.setTimeout(close, 1500);
    } catch (err) {
      console.error("Supplier invoice failed", err);
      setError(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <SheetContent side={isDesktop ? "right" : "bottom"} className="flex max-h-[92dvh] flex-col p-0 md:max-h-none md:sm:max-w-xl">
        <SheetHeader className="shrink-0 border-b px-6 py-4">
          <SheetTitle className="font-display text-2xl">Supplier invoice</SheetTitle>
        </SheetHeader>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {error && <div role="alert" className="flex items-center gap-2 rounded-md bg-danger-soft p-3 text-sm text-danger-soft-foreground"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
            {success && <div role="status" className="flex items-center gap-2 rounded-md bg-success-soft p-3 text-sm text-success-soft-foreground"><CheckCircle2 className="h-4 w-4 shrink-0" />{success}</div>}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Supplier *</Label>
                <Select value={form.supplier} onValueChange={(v) => setForm({ ...form, supplier: v })}>
                  <SelectTrigger aria-label="Supplier"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>{suppliers.map((s) => <SelectItem key={s.name} value={s.name}>{s.supplier_name || s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invoice-date">Date *</Label>
                <Input id="invoice-date" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Line items *</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setForm((f) => ({ ...f, items: [...f.items, blankLine()] }))}>
                  <Plus className="mr-1 h-3 w-3" /> Add line
                </Button>
              </div>
              {form.items.map((line, i) => (
                <div key={i} className="grid gap-2 rounded-card border p-3 sm:grid-cols-[1fr_1fr_auto]">
                  <Input aria-label={`Line ${i + 1} description`} placeholder="Description" required value={line.description} onChange={(e) => setLine(i, { description: e.target.value })} className="sm:col-span-3" />
                  <Select value={line.category} onValueChange={(v) => setLine(i, { category: v })}>
                    <SelectTrigger aria-label={`Line ${i + 1} category`}><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent>{categories.map((c) => <SelectItem key={c.name} value={c.name}>{c.account_name}</SelectItem>)}</SelectContent>
                  </Select>
                  <MoneyInput aria-label={`Line ${i + 1} amount`} placeholder="Amount" required value={line.amount} onChange={(v) => setLine(i, { amount: v })} className="sm:w-36" />
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${i + 1}`} disabled={form.items.length <= 1}
                    onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-right text-sm font-semibold">Total: {formatVNDFull(total)}</p>
          </div>
          <SheetFooter className="shrink-0 gap-2 border-t px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit" disabled={saving || incomplete || !!success}>{saving ? "Creating..." : "Create invoice"}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
