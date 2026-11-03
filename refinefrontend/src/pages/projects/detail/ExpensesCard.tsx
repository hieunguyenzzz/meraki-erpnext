import { useMemo } from "react";
import { SectionCard } from "@/components/wedding/SectionCard";
import { formatCompactAmount, formatVNDCompact, formatVNDFull } from "@/lib/format";
import type { WeddingData } from "./useWeddingData";
import type { useWeddingExpenses } from "./useWeddingExpenses";

/** Approved spend, budget (Finance only) and the biggest categories. */
export function ExpensesCard({ w, data, onOpenAll }: { w: WeddingData; data: ReturnType<typeof useWeddingExpenses>; onOpenAll: () => void }) {
  const budget: number = w.isFinance ? w.project?.custom_total_budget || 0 : 0;
  const rows = useMemo(() => {
    const by = new Map<string, number>();
    for (const e of data.expenses) {
      if (e.status === "Rejected") continue;
      const key = e.category ? data.categories.find((c) => c.name === e.category)?.account_name ?? e.category : "Uncategorised";
      by.set(key, (by.get(key) ?? 0) + (e.amount || 0));
    }
    const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    return { top, max: top[0]?.[1] ?? 0 };
  }, [data.expenses, data.categories]);

  return (
    <SectionCard
      title="Expenses"
      action={
        <button type="button" onClick={onOpenAll} className="text-sm font-semibold text-primary hover:underline">
          Open
        </button>
      }
    >
      <div className="text-[26px] font-bold tabular-nums" title={formatVNDFull(data.approvedTotal)}>
        {formatVNDCompact(data.approvedTotal)}
        {budget > 0 && <span className="ml-1.5 text-sm font-medium text-muted-foreground">of {formatVNDCompact(budget)} budget</span>}
      </div>
      {rows.top.length === 0 ? (
        <p className="text-sm text-muted-foreground">No expenses yet.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {rows.top.map(([label, amount]) => (
            <li key={label} className="flex items-center gap-2.5">
              <span className="w-24 truncate">{label}</span>
              <div className="h-2 flex-1 rounded-full bg-muted">
                <div className="h-2 rounded-full bg-gilt" style={{ width: `${rows.max ? Math.round((amount / rows.max) * 100) : 0}%` }} />
              </div>
              <span className="w-20 text-right tabular-nums" title={formatVNDFull(amount)}>{formatCompactAmount(amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
