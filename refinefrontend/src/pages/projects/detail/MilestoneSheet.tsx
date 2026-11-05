import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { formatVNDFull } from "@/lib/format";
import { todayVN } from "@/lib/businessTime";
import { InlineError } from "./InlineError";
import type { WeddingData } from "./useWeddingData";

/** What the panel opens with: `editing` is the invoice being changed, or null when adding. */
export interface MilestoneTarget {
  editing: string | null;
  label: string;
  amount: string;
  invoiceDate: string;
}

interface Props {
  w: WeddingData;
  target: MilestoneTarget | null;
  onClose: () => void;
}

/** Add / edit / delete a payment milestone (a Sales Invoice linked to the wedding). */
export function MilestoneSheet({ w, target, onClose }: Props) {
  const { name, soItems, invoices, totalValue, totalInvoiced, fetchInvoices } = w;
  const [isSubmittingMilestone, setIsSubmittingMilestone] = useState(false);
  const [milestoneError, setMilestoneError] = useState<string | null>(null);
  const [editingMilestone, setEditingMilestone] = useState<string | null>(null);
  const [milestoneForm, setMilestoneForm] = useState({ label: "", amount: "", invoiceDate: todayVN() });

  useEffect(() => {
    if (!target) return;
    setEditingMilestone(target.editing);
    setMilestoneForm({ label: target.label, amount: target.amount, invoiceDate: target.invoiceDate });
    setMilestoneError(null);
  }, [target]);

  async function handleAddMilestone(e: React.FormEvent) {
    e.preventDefault();
    if (!milestoneForm.amount) return;
    setIsSubmittingMilestone(true);
    setMilestoneError(null);
    try {
      const url = editingMilestone
        ? `/inquiry-api/wedding/${name}/milestone/${editingMilestone}`
        : `/inquiry-api/wedding/${name}/milestone`;
      const method = editingMilestone ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: parseFloat(milestoneForm.amount),
          label: milestoneForm.label,
          invoice_date: milestoneForm.invoiceDate,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Failed to ${editingMilestone ? "update" : "create"} milestone`);
      }
      onClose();
      if (name) fetchInvoices(name);
    } catch (err) {
      setMilestoneError(err instanceof Error ? err.message : `Failed to ${editingMilestone ? "update" : "create"} milestone`);
    } finally {
      setIsSubmittingMilestone(false);
    }
  }

  async function handleDeleteMilestone() {
    if (!editingMilestone || !window.confirm("Delete this payment milestone? This cannot be undone.")) return;
    setIsSubmittingMilestone(true);
    setMilestoneError(null);
    try {
      const res = await fetch(`/inquiry-api/wedding/${name}/milestone/${editingMilestone}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to delete milestone");
      }
      onClose();
      if (name) fetchInvoices(name);
    } catch (err) {
      setMilestoneError(err instanceof Error ? err.message : "Failed to delete milestone");
    } finally {
      setIsSubmittingMilestone(false);
    }
  }

  return (
  <Sheet open={!!target} onOpenChange={(next) => { if (!next) onClose(); }}>
    <SheetContent side="right" className="sm:max-w-md flex flex-col p-0">
      <SheetHeader className="px-6 py-4 border-b shrink-0">
        <SheetTitle>{editingMilestone ? "Edit Payment Milestone" : "Add Payment Milestone"}</SheetTitle>
      </SheetHeader>
      <form onSubmit={handleAddMilestone} className="flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <InlineError message={milestoneError} />
          <div className="space-y-2">
            <Label htmlFor="milestone-label">Label</Label>
            <Input
              id="milestone-label"
              placeholder="e.g. Deposit, Second Payment"
              value={milestoneForm.label}
              onChange={(e) => setMilestoneForm({ ...milestoneForm, label: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="milestone-amount">Amount (VND) *</Label>
            {(() => {
              const pkgRate = soItems.find((i) => i.item_code === "Wedding Planning Service")?.rate || 0;
              const travelFee = soItems.find((i) => i.item_code === "Travel Fee")?.amount || 0;
              const editingAmt = editingMilestone
                ? (invoices.find((i: any) => i.name === editingMilestone)?.grand_total || 0)
                : 0;
              const remaining = Math.max(0, totalValue - totalInvoiced + editingAmt);
              const presets = [
                { label: "50% Deposit", amount: Math.round(pkgRate * 0.5) },
                { label: "30% + Travel", amount: Math.round(pkgRate * 0.3) + travelFee },
                { label: "Remaining", amount: Math.round(remaining) },
              ];
              return (
            <div className="flex gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={() => setMilestoneForm({ ...milestoneForm, amount: String(p.amount), label: p.label === "Remaining" ? "Final Payment" : p.label === "50% Deposit" ? "Deposit" : "Second Payment" })}
                >
                  {p.label}
                </button>
              ))}
            </div>
              );
            })()}
            <Input
              id="milestone-amount"
              type="number"
              placeholder="25000000"
              value={milestoneForm.amount}
              onChange={(e) => setMilestoneForm({ ...milestoneForm, amount: e.target.value })}
              required
            />
            {milestoneForm.amount && totalValue > 0 && (
              <p className="text-xs text-muted-foreground">
                = {Math.round((parseFloat(milestoneForm.amount) / totalValue) * 100)}% of total
              </p>
            )}
            {(() => {
              const editingAmount = editingMilestone
                ? (invoices.find((i: any) => i.name === editingMilestone)?.grand_total || 0)
                : 0;
              const adjustedInvoiced = totalInvoiced - editingAmount;
              const remaining = Math.max(0, totalValue - adjustedInvoiced);
              return (
                <>
                  <p className="text-xs text-muted-foreground">
                    Remaining: {formatVNDFull(remaining)}
                  </p>
                  {milestoneForm.amount &&
                    totalValue > 0 &&
                    parseFloat(milestoneForm.amount) > remaining && (
                      <p className="text-xs text-amber-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Amount exceeds remaining unbilled ({formatVNDFull(remaining)})
                      </p>
                    )}
                </>
              );
            })()}
          </div>
          <div className="space-y-2">
            <Label htmlFor="milestone-invoice-date">Payment Date</Label>
            <Input
              id="milestone-invoice-date"
              type="date"
              value={milestoneForm.invoiceDate}
              onChange={(e) => setMilestoneForm({ ...milestoneForm, invoiceDate: e.target.value })}
            />
          </div>
        </div>
        <SheetFooter className="px-6 py-4 border-t shrink-0">
          {editingMilestone && (
            <Button
              type="button"
              variant="destructive"
              className="mr-auto"
              disabled={isSubmittingMilestone}
              onClick={handleDeleteMilestone}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Delete
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => onClose()}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmittingMilestone || !milestoneForm.amount}
          >
            {isSubmittingMilestone ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {editingMilestone ? "Updating..." : "Creating..."}
              </>
            ) : (
              editingMilestone ? "Update Milestone" : "Create Milestone"
            )}
          </Button>
        </SheetFooter>
      </form>
    </SheetContent>
  </Sheet>
  );
}
