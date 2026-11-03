import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/wedding/SectionCard";
import { daysUntilVN, todayVN } from "@/lib/businessTime";
import { formatVNDCompact, formatVNDFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MilestoneSheet, type MilestoneTarget } from "./MilestoneSheet";
import type { WeddingData } from "./useWeddingData";

function dueText(inv: any): string {
  if (!inv.due_date) return "";
  const days = daysUntilVN(inv.due_date);
  if (days < 0) return `Due ${inv.due_date} · ${-days} ${days === -1 ? "day" : "days"} ago`;
  return `Due ${inv.due_date} · ${days === 0 ? "today" : `in ${days} ${days === 1 ? "day" : "days"}`}`;
}

/** Payment progress and milestones (Finance only). % paid = sum(grand_total - outstanding) of the wedding's invoices / Sales Order total. */
export function PaymentsCard({ w }: { w: WeddingData }) {
  const { invoices, totalValue, totalPaid, totalOutstanding, paidPct, name } = w;
  const [target, setTarget] = useState<MilestoneTarget | null>(null);

  function openAdd() {
    setTarget({ editing: null, label: "", amount: "", invoiceDate: todayVN() });
  }

  async function openEdit(inv: any) {
    // Fetch the full invoice to parse the label out of its item name
    let label = "";
    try {
      const res = await fetch(`/api/resource/Sales Invoice/${inv.name}`, { credentials: "include" });
      const data = await res.json();
      const itemName = data.data?.items?.[0]?.item_name || "";
      const separator = " — ";
      label = itemName.includes(separator) ? itemName.split(separator)[0] : "";
    } catch (err) {
      console.error("[wedding] milestone label load failed", name, inv.name, err);
    }
    setTarget({ editing: inv.name, label, amount: String(inv.grand_total), invoiceDate: inv.posting_date || todayVN() });
  }

  return (
    <SectionCard title="Payment milestones">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-display text-[34px] font-semibold leading-9 lining-nums">
            {paidPct}% <span className="font-sans text-sm font-normal text-muted-foreground">paid</span>
          </span>
          <span className="text-sm tabular-nums text-muted-foreground" title={`${formatVNDFull(totalPaid)} of ${formatVNDFull(totalValue)}`}>
            {formatVNDCompact(totalPaid)} of {formatVNDCompact(totalValue)}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.min(paidPct, 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Paid">
          <div className="h-full rounded-full bg-success transition-all duration-700" style={{ width: `${Math.min(paidPct, 100)}%` }} />
        </div>
        {totalOutstanding > 0 && <p className="text-xs text-muted-foreground">{formatVNDFull(totalOutstanding)} remaining</p>}
      </div>

      {invoices.length > 0 ? (
        <ul>
          {(invoices as any[]).map((inv, index) => {
            const isPaid = inv.status === "Paid" || inv.outstanding_amount === 0;
            const isOverdue = inv.status === "Overdue";
            const pct = totalValue > 0 ? Math.round((inv.grand_total / totalValue) * 100) : 0;
            return (
              <li key={inv.name} className={cn(index > 0 && "border-t")}>
                <button
                  type="button"
                  onClick={() => openEdit(inv)}
                  className="grid min-h-[52px] w-full grid-cols-[22px_1fr_auto] items-center gap-3 rounded-md py-2 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={cn(
                      "flex h-[22px] w-[22px] items-center justify-center rounded-full",
                      isPaid ? "bg-success-soft text-success-soft-foreground" : isOverdue ? "border-2 border-destructive" : "border-2 border-warning"
                    )}
                  >
                    {isPaid && <Check className="h-3.5 w-3.5" strokeWidth={2.6} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{pct}% · {inv.name}</span>
                    <span className={cn("block text-[13px]", isPaid ? "text-muted-foreground" : isOverdue ? "font-semibold text-destructive" : "font-semibold text-warning")}>
                      {isPaid ? `Paid${inv.posting_date ? ` ${inv.posting_date}` : ""}` : dueText(inv) || "Unpaid"}
                    </span>
                  </span>
                  <b className="tabular-nums" title={formatVNDFull(inv.grand_total)}>{formatVNDCompact(inv.grand_total)}</b>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-2 text-center text-sm text-muted-foreground">No payment milestones yet.</p>
      )}

      <Button variant="outline" size="sm" className="w-full" onClick={openAdd}>
        <Plus className="h-4 w-4" />
        Add Payment Milestone
      </Button>
      <MilestoneSheet w={w} target={target} onClose={() => setTarget(null)} />
    </SectionCard>
  );
}
