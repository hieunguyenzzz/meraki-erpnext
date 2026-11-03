import { useMemo, useState } from "react";
import { CheckCheck, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExpenseCategorySummary } from "@/components/projects/ExpenseCategorySummary";
import { SectionCard } from "@/components/wedding/SectionCard";
import { formatVNDFull } from "@/lib/format";
import { ExpenseRow } from "./ExpenseRow";
import { InlineError } from "./InlineError";
import { NewExpenseRow } from "./NewExpenseRow";
import type { useWeddingExpenses } from "./useWeddingExpenses";
import type { WeddingData } from "./useWeddingData";

interface Props {
  w: WeddingData;
  data: ReturnType<typeof useWeddingExpenses>;
}

/** Wedding expenses table with approve / reject / edit / receipts (tab shown only to roles that may see expenses). */
export function ExpensesTab({ w, data }: Props) {
  const { name, employees, isFinance, teamIds } = w;
  const { expenses, refetch: fetchExpenses, approvedTotal: approvedExpensesTotal, pending: pendingExpenses, categories: expenseCategories, setCategories: setExpenseCategories } = data;
  const [addingExpense, setAddingExpense] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const [receiptBusy, setReceiptBusy] = useState<Record<string, boolean>>({});
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isApprovingAll, setIsApprovingAll] = useState(false);

  // Team members for the "In charge by" dropdown
  const weddingTeam = useMemo(() => employees.filter((e) => teamIds.all.includes(e.id)), [employees, teamIds]);

  /** Run a receipt upload/delete with a per-row spinner; waits for the refetch so the new thumbnail is there when it clears. */
  async function runReceiptAction(piName: string, fallbackError: string, action: () => Promise<string | undefined | void>) {
    setExpenseError(null);
    setReceiptBusy(b => ({ ...b, [piName]: true }));
    try {
      const warning = await action();
      if (warning) setExpenseError(warning);
      await fetchExpenses();
    } catch (error) {
      setExpenseError(error instanceof Error ? error.message : fallbackError);
    } finally {
      setReceiptBusy(b => ({ ...b, [piName]: false }));
    }
  }

  async function handleApproveExpense(piName: string) {
    try {
      const resp = await fetch(`/inquiry-api/expense/${piName}/approve`, { method: "POST", credentials: "include" });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to approve");
      }
      fetchExpenses();
    } catch (error) {
      setExpenseError(error instanceof Error ? error.message : "Failed to approve expense");
    }
  }

  async function handleApproveAll() {
    if (!name || pendingExpenses.length === 0) return;
    setIsApprovingAll(true);
    setExpenseError(null);
    try {
      const resp = await fetch(`/inquiry-api/expense/approve-all?project=${encodeURIComponent(name)}`, { method: "POST", credentials: "include" });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to approve expenses");
      }
      fetchExpenses();
    } catch (error) {
      setExpenseError(error instanceof Error ? error.message : "Failed to approve all expenses");
    } finally {
      setIsApprovingAll(false);
    }
  }

  async function handleRejectExpense(piName: string) {
    try {
      const resp = await fetch(`/inquiry-api/expense/${piName}/reject`, { method: "POST", credentials: "include" });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to reject");
      }
      fetchExpenses();
    } catch (error) {
      setExpenseError(error instanceof Error ? error.message : "Failed to reject expense");
    }
  }

  async function handleDeleteExpense(piName: string) {
    try {
      const resp = await fetch(`/inquiry-api/expense/${piName}`, { method: "DELETE", credentials: "include" });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to delete");
      }
      fetchExpenses();
    } catch (error) {
      setExpenseError(error instanceof Error ? error.message : "Failed to delete expense");
    }
  }

  async function handleSaveEditExpense(
    piName: string,
    v: { date: string; description: string; amount: string; category: string; staff: string; note: string },
    originalNote: string
  ): Promise<boolean> {
    try {
      const resp = await fetch(`/inquiry-api/expense/${piName}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          date: v.date,
          description: v.description,
          amount: parseFloat(v.amount) || 0,
          account: v.category,
          staff: v.staff,
          // omit when unchanged so the backend keeps the raw remarks
          ...(v.note.trim() !== originalNote ? { note: v.note.trim() } : {}),
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to save");
      }
      fetchExpenses();
      return true;
    } catch (error) {
      setExpenseError(error instanceof Error ? error.message : "Failed to save expense");
      return false;
    }
  }

  return (
    <SectionCard
      title="Wedding expenses"
      action={
        <div className="flex flex-wrap gap-2">
          {isFinance && pendingExpenses.length > 0 && (
            <Button size="sm" variant="outline" onClick={handleApproveAll} disabled={isApprovingAll}>
              <CheckCheck className="h-4 w-4" />
              {isApprovingAll ? "Approving..." : `Approve All (${pendingExpenses.length})`}
            </Button>
          )}
          <Button size="sm" onClick={() => setAddingExpense(true)} disabled={addingExpense}>
            <Plus className="h-4 w-4" />
            Add Expense
          </Button>
        </div>
      }
    >
      <p className="-mt-2 text-sm text-muted-foreground">Total approved: {formatVNDFull(approvedExpensesTotal)}</p>
      <InlineError message={expenseError} />
      <ExpenseCategorySummary expenses={expenses} categories={expenseCategories} />
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[860px] text-sm">
    <colgroup>
      <col className="w-16" />
      <col className="w-[105px]" />
      <col />
      <col className="w-[120px]" />
      <col className="w-[110px]" />
      <col className="w-[160px]" />
      <col className="w-16" />
      <col className="w-20" />
    </colgroup>
    <thead>
      <tr className="border-b bg-muted/50">
        <th className="px-2 py-2 w-10"></th>
        <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Date</th>
        <th className="px-3 py-2 text-left font-medium">Description</th>
        <th className="px-3 py-2 text-left font-medium whitespace-nowrap">In charge by</th>
        <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Category</th>
        <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Amount</th>
        <th className="px-3 py-2 text-left font-medium whitespace-nowrap w-20">Status</th>
        <th className="px-3 py-2 w-20"></th>
      </tr>
    </thead>
    <tbody>
            {addingExpense && (
              <NewExpenseRow
                projectName={name}
                weddingTeam={weddingTeam}
                categories={expenseCategories}
                onCategoryCreated={(c) => setExpenseCategories((prev) => [...prev, c])}
                onError={setExpenseError}
                onSaved={() => { setAddingExpense(false); fetchExpenses(); }}
                onCancel={() => setAddingExpense(false)}
              />
            )}
            {expenses.map((exp) => (
              <ExpenseRow
                key={exp.name}
                exp={exp}
                employees={employees}
                weddingTeam={weddingTeam}
                categories={expenseCategories}
                isFinance={isFinance}
                receiptBusy={!!receiptBusy[exp.name]}
                onPreview={setPreviewImage}
                runReceiptAction={runReceiptAction}
                onApprove={handleApproveExpense}
                onReject={handleRejectExpense}
                onDelete={handleDeleteExpense}
                onSave={handleSaveEditExpense}
              />
            ))}
            {expenses.length === 0 && !addingExpense && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  No expenses yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    {previewImage && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 cursor-pointer"
        onClick={() => setPreviewImage(null)}
      >
        <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
          <img src={previewImage} alt="Receipt" className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl object-contain" />
          <button
            className="absolute -top-3 -right-3 w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-md hover:bg-gray-100 transition-colors"
            onClick={() => setPreviewImage(null)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )}
    </SectionCard>
  );
}
