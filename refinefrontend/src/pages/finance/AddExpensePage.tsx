import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Loader2, NotebookPen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AmountField } from "./add-expense/AmountField";
import { CategoryChips } from "./add-expense/CategoryChips";
import { ContextRow } from "./add-expense/ContextRow";
import { ReceiptPicker } from "./add-expense/ReceiptPicker";
import { SavedState, type SavedSummary } from "./add-expense/SavedState";
import { fetchCategories, scanBill, submitExpense, type ExpenseCategory } from "./add-expense/api";
import { loadRecents, pickDefaultWedding, rememberCategory, sanitiseAmount } from "./add-expense/defaults";
import { todayVN } from "@/lib/businessTime";
import { useExpenseWeddings } from "./add-expense/useExpenseWeddings";

type Errors = Partial<Record<"amount" | "category" | "proof", string>>;

export default function AddExpensePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedWedding = searchParams.get("project");
  const { weddings, assigned, loading, employeeId } = useExpenseWeddings();
  const assignedIds = useMemo(() => new Set(assigned.map((w) => w.id)), [assigned]);
  const today = todayVN();

  const [project, setProject] = useState("");
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [recents, setRecents] = useState<string[]>(loadRecents);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saved, setSaved] = useState<SavedSummary | null>(null);

  const amountRef = useRef<HTMLInputElement>(null);
  const weddingTouched = useRef(false);

  // Default wedding: the one named in ?project= (from a wedding page) if the user may log against it,
  // else assigned and happening today, else the next upcoming one (until the user picks).
  useEffect(() => {
    if (loading || weddingTouched.current) return;
    const requested = requestedWedding && weddings.some((w) => w.id === requestedWedding) ? requestedWedding : null;
    setProject(requested ?? pickDefaultWedding(assigned, today) ?? "");
  }, [loading, assigned, weddings, today, requestedWedding]);

  // A wedding expense only offers wedding categories; an office expense offers all of them.
  useEffect(() => {
    const controller = new AbortController();
    fetchCategories(!!project, controller.signal)
      .then((data) => {
        setCategories(data);
        setCategoriesError(null);
        setCategory((prev) => (data.some((c) => c.name === prev) ? prev : ""));
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setCategoriesError(err instanceof Error ? err.message : "Could not load categories");
      });
    return () => controller.abort();
  }, [project]);

  useEffect(() => { if (!saved) amountRef.current?.focus(); }, [saved]);

  const categoryLabel = (name: string) => categories.find((c) => c.name === name)?.account_name ?? name;
  const weddingLabel = weddings.find((w) => w.id === project)?.name ?? "Office expense";

  async function handleScan() {
    if (!receipt) return;
    setScanning(true);
    setFormError(null);
    try {
      const r = await scanBill(receipt);
      if (r.amount != null) setAmount(sanitiseAmount(String(Math.round(Math.abs(r.amount)))));
      if (r.description) setDescription(r.description);
      if (r.date && r.date <= today) setDate(r.date);
      if (r.category && categories.some((c) => c.name === r.category)) setCategory(r.category);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Could not read the bill");
    } finally {
      setScanning(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const found: Errors = {};
    if (!amount || Number(amount) <= 0) found.amount = "Enter the amount";
    if (!category) found.category = "Pick a category";
    if (!receipt && !description.trim()) found.proof = "Add a bill photo or say what it was for";
    setErrors(found);
    if (Object.keys(found).length) {
      // Bring the first invalid field into view (the save bar covers the page bottom)
      const target = found.amount ? amountRef.current
        : found.category ? document.querySelector<HTMLElement>("#expense-category button")
        : document.getElementById("expense-description");
      target?.scrollIntoView({ block: "center" });
      target?.focus({ preventScroll: true });
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const res = await submitExpense({
        project, date, category, note, receipt,
        amount: Number(amount),
        // Backend requires a description: fall back to the category name when only a photo was given.
        description: description.trim() || categoryLabel(category),
        staff: employeeId || "",
      });
      rememberCategory(category);
      setRecents(loadRecents());
      setSaved({ amount, category: categoryLabel(category), wedding: weddingLabel, date, hasReceipt: !!receipt, receiptFailed: res.receipt_attached === false, reference: res.name });
    } catch (err: unknown) {
      // Keep everything the user entered so they can retry
      setFormError(err instanceof Error ? err.message : "Could not save the expense");
    } finally {
      setSaving(false);
    }
  }

  function addAnother() {
    setSaved(null);
    setAmount(""); setCategory(""); setDescription(""); setNote(""); setShowNote(false);
    setReceipt(null); setErrors({}); setFormError(null);
  }

  return (
    <div className="mx-auto w-full max-w-md max-md:pb-28 md:mt-4 md:rounded-card md:border md:bg-card md:p-6 md:shadow-sm">
      {saved ? (
        <SavedState saved={saved} onAddAnother={addAnother} onDone={() => navigate("/")} />
      ) : (
        <form onSubmit={handleSave} noValidate className="flex flex-col gap-4">
          <header className="flex items-center justify-between">
            <button type="button" aria-label="Close" onClick={() => navigate(-1)} className="-ml-2 flex h-12 w-12 items-center justify-center rounded-full hover:bg-muted">
              <X className="h-5 w-5" aria-hidden />
            </button>
            <h1 className="text-[17px] font-semibold">New expense</h1>
            <div className="w-10" />
          </header>

          <ContextRow
            weddings={weddings}
            assignedIds={assignedIds}
            project={project}
            onProject={(id) => { weddingTouched.current = true; setProject(id); }}
            date={date}
            today={today}
            onDate={setDate}
          />

          <AmountField
            ref={amountRef}
            digits={amount}
            error={errors.amount}
            onChange={(d) => { setAmount(d); if (errors.amount) setErrors((p) => ({ ...p, amount: undefined })); }}
          />

          <CategoryChips
            categories={categories}
            recents={recents}
            value={category}
            error={errors.category}
            onChange={(c) => { setCategory(c); setErrors((p) => ({ ...p, category: undefined })); }}
          />

          <ReceiptPicker file={receipt} onChange={(f) => { setReceipt(f); setErrors((p) => ({ ...p, proof: undefined })); }} onScan={handleScan} scanning={scanning} />

          <div>
            <Input
              id="expense-description"
              aria-label="What was it for"
              aria-invalid={!!errors.proof}
              value={description}
              maxLength={140}
              placeholder={receipt ? "What was it for? (optional)" : "What was it for?"}
              onChange={(e) => { setDescription(e.target.value); setErrors((p) => ({ ...p, proof: undefined })); }}
            />
            {errors.proof && <p role="alert" className="mt-2 text-sm text-destructive">{errors.proof}</p>}
          </div>

          {showNote ? (
            <Textarea aria-label="Note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for Finance (optional)" />
          ) : (
            <button type="button" onClick={() => setShowNote(true)} className="flex h-11 items-center gap-2 self-start text-sm font-semibold text-primary">
              <NotebookPen className="h-4 w-4" aria-hidden />Add a note
            </button>
          )}

          {/* Thumb-reach save: pinned above the bottom bar on phones, inline on desktop */}
          <div className="sticky bottom-[calc(84px+env(safe-area-inset-bottom,0px))] z-10 -mx-4 bg-background/95 px-4 pb-2 pt-3 backdrop-blur md:static md:mx-0 md:bg-transparent md:p-0">
            {(formError ?? categoriesError) && (
              <div role="alert" className="mb-2 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">{formError ?? categoriesError}</div>
            )}
            <Button type="submit" size="lg" className="h-14 w-full text-base" disabled={saving}>
              {saving ? <><Loader2 className="h-5 w-5 animate-spin" />Saving...</> : "Save expense"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
