import { useRef, useState, type ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiTile } from "@/components/dashboard/KpiTile";
import { MobileKpiTiles } from "@/components/dashboard/MobileKpiTiles";
import { MobileMonthChart } from "@/components/dashboard/MobileMonthChart";
import { MobileMonthTable } from "@/components/dashboard/MobileMonthTable";
import { MonthlyChart } from "@/components/dashboard/MonthlyChart";
import { MonthlyTable } from "@/components/dashboard/MonthlyTable";
import { NetProfitChart } from "@/components/dashboard/NetProfitChart";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { todayVN, yearVN } from "@/lib/businessTime";
import { useFinancialOverview } from "@/components/dashboard/useFinancialOverview";

const EMPTY_TOTALS = {
  revenue: 0, expenses: 0, net: 0, collected: 0,
  outstanding_receivables: 0, outstanding_invoices_count: 0,
  active_pipeline: 0, active_weddings_count: 0,
};

/**
 * Director home: year picker, headline figures, monthly charts and table (GET /inquiry-api/financial-overview).
 * Phones get the compact layout (four tiles, one switchable bar chart, a month table); `switcher` is the Business / My day switch.
 */
export default function DirectorSection({ switcher }: { switcher?: ReactNode }) {
  const currentYear = yearVN();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const { data, isLoading, isError } = useFinancialOverview(selectedYear, "DirectorSection");
  const isDesktop = useMediaQuery("(min-width: 768px)");

  // Remember the year list so the picker still works after a year fails to load.
  const yearsRef = useRef<number[]>([currentYear]);
  if (data) yearsRef.current = data.available_years;
  const availableYears = yearsRef.current;
  const months = data?.months ?? [];
  // Phones list the months that have happened so far; earlier years show all twelve.
  const shownMonths = selectedYear === currentYear ? months.filter((m) => m.month <= todayVN().slice(0, 7)) : months;
  const totals = data?.totals ?? EMPTY_TOTALS;
  const kpiLabel = selectedYear === currentYear ? "YTD" : String(selectedYear);
  const invoices = totals.outstanding_invoices_count;
  const weddings = totals.active_weddings_count;

  return (
    <div className="space-y-4 pb-6 md:space-y-6 md:pb-0">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-semibold md:font-display md:text-4xl md:leading-tight">{isDesktop ? "Business overview" : "Business"}</h1>
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

      {switcher}

      {isError && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">
          Could not load the figures for {selectedYear}. Please try again.
        </p>
      )}

      {!isError && !isDesktop && (
        <>
          <MobileKpiTiles totals={totals} loading={isLoading} />
          {isLoading ? <Skeleton className="h-[290px] w-full rounded-2xl" /> : shownMonths.length > 0 && (
            <MobileMonthChart key={selectedYear} months={shownMonths} year={selectedYear} ytd={selectedYear === currentYear} />
          )}
          {!isLoading && shownMonths.length > 0 && <MobileMonthTable months={shownMonths} />}
        </>
      )}

      {!isError && isDesktop && (
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
