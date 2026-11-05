import { useState } from "react";
import { chartColors, monthShort } from "@/lib/chartTheme";
import { formatMillions, formatVNDFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MonthRow } from "@/components/dashboard/financialOverview";

type Metric = "revenue" | "expenses" | "weddings" | "net";

const METRICS: { id: Metric; label: string; color: string }[] = [
  { id: "revenue", label: "Revenue", color: chartColors.revenue },
  { id: "expenses", label: "Expenses", color: chartColors.expenses },
  { id: "weddings", label: "Weddings", color: chartColors.weddings },
  { id: "net", label: "Net", color: chartColors.net },
];

const HEIGHT = 150;

function caption(metric: Metric, months: MonthRow[], year: number, ytd: boolean): string {
  const values = months.map((m) => m[metric]);
  const peak = Math.max(...values);
  if (peak <= 0) return `No ${metric === "weddings" ? "weddings" : "figures"} recorded for ${year} yet.`;
  const peakMonth = monthShort(months[values.indexOf(peak)].month);
  if (metric === "weddings") {
    const total = values.reduce((a, b) => a + b, 0);
    return `Weddings per month, ${total} ${ytd ? "so far" : `in ${year}`}. Busiest: ${peakMonth}, ${peak}.`;
  }
  return `VND millions. Highest: ${peakMonth}, ${formatMillions(peak)}.`;
}

/** Phone chart: one metric at a time as plain bars, a caption naming the peak month. Net may dip below zero. */
export function MobileMonthChart({ months, year, ytd }: { months: MonthRow[]; year: number; ytd: boolean }) {
  const [metric, setMetric] = useState<Metric>("revenue");
  const def = METRICS.find((m) => m.id === metric)!;
  const values = months.map((m) => m[metric]);
  const maxPos = Math.max(0, ...values);
  const maxNeg = Math.max(0, ...values.map((v) => -v));
  const range = maxPos + maxNeg || 1;
  const zeroFromBottom = (maxNeg / range) * HEIGHT;

  return (
    <section aria-label="By month" className="flex flex-col gap-2.5 rounded-2xl border bg-card p-3">
      <div role="tablist" aria-label="Chart metric" className="flex gap-1 rounded-full bg-muted p-[3px]">
        {METRICS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={m.id === metric}
            onClick={() => setMetric(m.id)}
            className={cn(
              "h-9 flex-1 rounded-full text-[13px] font-semibold transition-colors",
              m.id === metric ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="relative flex gap-1.5" style={{ height: HEIGHT }} aria-hidden>
        <div className="absolute inset-x-0 border-t" style={{ bottom: zeroFromBottom }} />
        {months.map((m, i) => {
          const v = values[i];
          const h = Math.round((Math.abs(v) / range) * HEIGHT);
          return (
            <div key={m.month} className="relative flex-1" title={`${monthShort(m.month)}: ${metric === "weddings" ? v : formatVNDFull(v)}`}>
              <div
                className="absolute left-1/2 w-full max-w-5 -translate-x-1/2 rounded-t"
                style={v >= 0 ? { bottom: zeroFromBottom, height: h, background: def.color } : { bottom: zeroFromBottom - h, height: h, background: "hsl(var(--destructive))", borderRadius: "0 0 4px 4px" }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 text-[10px] text-muted-foreground" aria-hidden>
        {months.map((m) => <span key={m.month} className="flex-1 text-center">{monthShort(m.month).slice(0, 3)}</span>)}
      </div>
      <p className="text-xs text-muted-foreground">{caption(metric, months, year, ytd)}</p>
    </section>
  );
}
