import { formatCompactAmount, formatVNDFull } from "@/lib/format";
import type { ExpenseCategory, ExpenseSummary as Summary } from "./types";

/** Dark total tile plus one tile per category; bars show each category's share of the total. */
export function ExpenseSummary({ label, summary, categories }: { label: string; summary: Summary; categories: ExpenseCategory[] }) {
  return (
    <section aria-label="Totals" className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 tabular-nums">
      <div className="col-span-2 flex flex-col gap-1.5 rounded-card border border-foreground bg-foreground p-4 text-background">
        <span className="text-xs opacity-80">Total · {label}</span>
        <b className="text-[22px] leading-7">{formatVNDFull(summary.total)}</b>
        <span className="text-xs opacity-80">{summary.counted} approved {summary.counted === 1 ? "expense" : "expenses"}</span>
        {summary.pending > 0 && <span className="text-xs opacity-80">+ {formatVNDFull(summary.pending)} pending</span>}
      </div>
      {categories.map((c) => (
        <div key={c.label} className="flex min-w-0 flex-col gap-1.5 rounded-card border bg-card p-4">
          <span className="truncate text-xs text-muted-foreground" title={c.label}>{c.label}</span>
          <b className="text-xl" title={formatVNDFull(c.amount)}>{formatCompactAmount(c.amount)}</b>
          <div className="h-[5px] rounded-full bg-muted" aria-hidden>
            <div className="h-[5px] rounded-full bg-gilt" style={{ width: `${summary.total > 0 ? Math.round((c.amount / summary.total) * 100) : 0}%` }} />
          </div>
        </div>
      ))}
    </section>
  );
}
