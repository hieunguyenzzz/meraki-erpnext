import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatVNDCompact, formatVNDFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OverviewTotals } from "@/components/dashboard/financialOverview";

const TILES: { id: string; label: string; pick: (t: OverviewTotals) => number }[] = [
  { id: "revenue", label: "Revenue", pick: (t) => t.revenue },
  { id: "expenses", label: "Expenses", pick: (t) => t.expenses },
  { id: "net", label: "Net profit", pick: (t) => t.net },
  { id: "collected", label: "Collected", pick: (t) => t.collected },
];

/** Four headline figures for phones: short value, tap one to see its exact VND (one open at a time). */
export function MobileKpiTiles({ totals, loading }: { totals: OverviewTotals; loading: boolean }) {
  const [open, setOpen] = useState<string>("revenue");
  return (
    <section aria-label="Headline figures" className="grid grid-cols-2 gap-2.5">
      {TILES.map((t) => {
        const amount = t.pick(totals);
        const isOpen = open === t.id && !loading;
        return (
          <button
            key={t.id}
            type="button"
            disabled={loading}
            aria-expanded={isOpen}
            onClick={() => setOpen(isOpen ? "" : t.id)}
            className={cn(
              "flex min-w-0 flex-col gap-0.5 rounded-2xl border px-3.5 py-3 text-left transition-colors disabled:cursor-default",
              isOpen ? "border-primary/30 bg-accent/60" : "bg-card",
            )}
          >
            <span className="text-xs text-muted-foreground">{t.label}</span>
            {loading ? (
              <Skeleton className="mt-1 h-7 w-24" />
            ) : (
              <b className={cn("whitespace-nowrap text-[22px] tabular-nums", t.id === "net" && amount < 0 && "text-destructive")}>
                {formatVNDCompact(amount)}
              </b>
            )}
            {isOpen && <span className="break-words text-xs font-semibold tabular-nums text-accent-foreground">{formatVNDFull(amount)}</span>}
          </button>
        );
      })}
    </section>
  );
}
