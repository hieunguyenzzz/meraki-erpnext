import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { parseAsString, useQueryState } from "nuqs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiTile } from "@/components/dashboard/KpiTile";
import { MonthlyChart } from "@/components/dashboard/MonthlyChart";
import { NetProfitChart } from "@/components/dashboard/NetProfitChart";
import { useFinancialOverview } from "@/components/dashboard/useFinancialOverview";
import type { OverviewTotals } from "@/components/dashboard/financialOverview";
import { RevenueTable } from "@/pages/finance/overview/RevenueTable";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { yearVN } from "@/lib/businessTime";

const EMPTY_TOTALS: OverviewTotals = {
  revenue: 0, expenses: 0, net: 0, collected: 0,
  outstanding_receivables: 0, outstanding_invoices_count: 0,
  active_pipeline: 0, active_weddings_count: 0,
};

/** The URL holds a four-digit year or "all"; anything else falls back to this year. */
const yearParser = parseAsString.withOptions({ history: "replace" });
function parseYear(raw: string | null): number | "all" | null {
  if (raw === "all") return "all";
  if (raw !== null && /^\d{4}$/.test(raw) && Number(raw) >= 2000 && Number(raw) <= 2100) return Number(raw);
  return null;
}

/** Revenue overview: one year of headline figures, charts and the full monthly table. */
export default function OverviewPage() {
  const currentYear = yearVN();
  const [yearParam, setYearParam] = useQueryState("year", yearParser);
  const selectedYear = parseYear(yearParam) ?? currentYear;
  const isAll = selectedYear === "all";
  const { data, isLoading, isError } = useFinancialOverview(selectedYear, "RevenueOverviewPage");
  const isDesktop = useMediaQuery("(min-width: 768px)");

  // Remember the year list so the picker still works after a year fails to load.
  const yearsRef = useRef<number[]>([currentYear]);
  if (data) yearsRef.current = data.available_years;
  const availableYears = yearsRef.current;

  // A year the backend does not know about (hand-typed URL) goes back to the default.
  useEffect(() => {
    if (!data || yearParam === null) return;
    const y = parseYear(yearParam);
    if (y !== "all" && (y === null || !data.available_years.includes(y))) setYearParam(null);
  }, [data, yearParam, setYearParam]);

  const months = data?.months ?? [];
  const totals = data?.totals ?? EMPTY_TOTALS;
  const kpiLabel = isAll ? "all time" : selectedYear === currentYear ? "YTD" : String(selectedYear);
  const invoices = totals.outstanding_invoices_count;

  return (
    <div className="space-y-4 pb-6 md:space-y-6 md:pb-0">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold leading-tight md:text-4xl">Revenue overview</h1>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Year
          <Select value={String(selectedYear)} onValueChange={(v) => setYearParam(v === String(currentYear) ? null : v)}>
            <SelectTrigger className="h-12 w-36 font-semibold text-foreground md:h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All years</SelectItem>
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
          Could not load the figures for {isAll ? "all years" : selectedYear}. Please try again.
        </p>
      )}

      {!isError && (
        <>
          <section aria-label="Headline figures" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <KpiTile label={`Revenue ${kpiLabel}`} amount={totals.revenue} loading={isLoading} />
            <KpiTile label={`Expenses ${kpiLabel}`} amount={totals.expenses} loading={isLoading} />
            <KpiTile label={`Net profit ${kpiLabel}`} amount={totals.net} loading={isLoading} tone={totals.net >= 0 ? "success" : "danger"} />
            <KpiTile label={`Collected ${kpiLabel}`} amount={totals.collected} loading={isLoading} />
          </section>

          {isLoading ? <Skeleton className="h-[320px] w-full rounded-card" /> : <MonthlyChart data={months} byYear={isAll} />}

          {isDesktop && (isLoading ? <Skeleton className="h-[300px] w-full rounded-card" /> : <NetProfitChart data={months} year={selectedYear} />)}

          <section aria-label="Receivables" className="grid grid-cols-1 gap-3">
            <KpiTile
              label="Outstanding receivables"
              amount={totals.outstanding_receivables}
              loading={isLoading}
              tone={invoices > 0 ? "danger" : "neutral"}
              caption={`${invoices} invoice${invoices !== 1 ? "s" : ""} with balance due`}
            />
            {!isLoading && invoices > 0 && (
              <Link to="/finance/invoices" className="inline-flex min-h-12 items-center text-sm font-semibold text-primary hover:underline">
                View invoices
              </Link>
            )}
          </section>

          {isLoading ? <Skeleton className="h-[300px] w-full rounded-card" /> : <RevenueTable data={months} totals={totals} year={selectedYear} />}
        </>
      )}
    </div>
  );
}
