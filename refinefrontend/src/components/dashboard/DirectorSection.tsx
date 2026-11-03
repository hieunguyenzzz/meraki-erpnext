import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiTile } from "@/components/dashboard/KpiTile";
import { MonthlyChart } from "@/components/dashboard/MonthlyChart";
import { MonthlyTable } from "@/components/dashboard/MonthlyTable";
import { NetProfitChart } from "@/components/dashboard/NetProfitChart";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { yearVN } from "@/lib/businessTime";
import type { OverviewData } from "@/components/dashboard/financialOverview";

const EMPTY_TOTALS = {
  revenue: 0, expenses: 0, net: 0, collected: 0,
  outstanding_receivables: 0, outstanding_invoices_count: 0,
  active_pipeline: 0, active_weddings_count: 0,
};

/** Director home: year picker, headline figures, monthly charts and table (GET /inquiry-api/financial-overview). */
export default function DirectorSection() {
  const currentYear = yearVN();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["financial-overview", selectedYear],
    queryFn: async () => {
      const r = await fetch(`/inquiry-api/financial-overview?year=${selectedYear}`, { credentials: "include" });
      if (!r.ok) throw new Error(`financial-overview returned ${r.status}`);
      return r.json() as Promise<OverviewData>;
    },
  });
  const isDesktop = useMediaQuery("(min-width: 768px)");

  // Remember the year list so the picker still works after a year fails to load.
  const yearsRef = useRef<number[]>([currentYear]);
  if (data) yearsRef.current = data.available_years;
  const availableYears = yearsRef.current;
  const months = data?.months ?? [];
  const totals = data?.totals ?? EMPTY_TOTALS;
  const kpiLabel = selectedYear === currentYear ? "YTD" : String(selectedYear);
  const invoices = totals.outstanding_invoices_count;
  const weddings = totals.active_weddings_count;

  return (
    <div className="space-y-4 pb-6 md:space-y-6 md:pb-0">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold leading-tight md:text-4xl">Business overview</h1>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Year
          <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="h-10 w-36 font-semibold text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}{y === currentYear ? " (now)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </header>

      {isError && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">
          Could not load the figures for {selectedYear}. Please try again.
        </p>
      )}

      {!isError && (
        <>
          <section aria-label="Headline figures" className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4 lg:gap-4">
            <KpiTile label={`Revenue ${kpiLabel}`} amount={totals.revenue} loading={isLoading} />
            <KpiTile label={`Expenses ${kpiLabel}`} amount={totals.expenses} loading={isLoading} />
            <KpiTile label={`Net profit ${kpiLabel}`} amount={totals.net} loading={isLoading} tone={totals.net >= 0 ? "success" : "danger"} />
            <KpiTile label={`Collected ${kpiLabel}`} amount={totals.collected} loading={isLoading} />
          </section>

          {isLoading ? <Skeleton className="h-[320px] w-full rounded-card" /> : <MonthlyChart data={months} />}

          {isDesktop && (isLoading ? <Skeleton className="h-[300px] w-full rounded-card" /> : <NetProfitChart data={months} year={selectedYear} />)}

          <section aria-label="Receivables and pipeline" className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:gap-4">
            <KpiTile
              label="Outstanding receivables"
              amount={totals.outstanding_receivables}
              loading={isLoading}
              tone={invoices > 0 ? "danger" : "neutral"}
              caption={`${invoices} invoice${invoices !== 1 ? "s" : ""} with balance due`}
            />
            <KpiTile
              label="Active weddings pipeline"
              amount={totals.active_pipeline}
              loading={isLoading}
              caption={`${weddings} upcoming wedding${weddings !== 1 ? "s" : ""}`}
            />
          </section>

          {!isLoading && months.length > 0 && <MonthlyTable data={months} />}
        </>
      )}
    </div>
  );
}
