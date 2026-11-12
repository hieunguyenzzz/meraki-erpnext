import { useMemo } from "react";
import { createParser, parseAsString, useQueryStates } from "nuqs";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatePanel } from "@/components/StatePanel";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { yearVN } from "@/lib/businessTime";
import { ReportsHeader } from "./ReportsHeader";
import { ExpenseFilters } from "./expenses/ExpenseFilters";
import { ExpenseCard, ExpenseTable } from "./expenses/ExpenseRows";
import { ExpenseSummary } from "./expenses/ExpenseSummary";
import { exportExpensesCsv } from "./expenses/exportCsv";
import { MONTH_NAMES } from "./expenses/types";
import { useExpenseReport, useWeddingList } from "./expenses/useExpenseReport";

const year4 = createParser<string>({ parse: (v) => (/^\d{4}$/.test(v) ? v : null), serialize: (v) => v });
const month12 = createParser<string>({ parse: (v) => (/^(?:[1-9]|1[0-2])$/.test(v) ? v : null), serialize: (v) => v });
const parsers = {
  year: year4.withDefault(""),
  month: month12.withDefault(""),
  project: parseAsString.withDefault(""),
};

export default function WeddingExpenseReportPage() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  // Filters live in the URL so Back restores them; junk values fall back to the defaults.
  const [f, setF] = useQueryStates(parsers, { clearOnDefault: true });

  // Wedding list is loaded once; the year picker and the default year come from it.
  const { projects, listError, retryList } = useWeddingList();
  const years = useMemo(() => {
    const s = new Set<string>();
    for (const p of projects ?? []) {
      const y = p.expected_end_date?.slice(0, 4);
      if (y) s.add(y);
    }
    return Array.from(s).sort().reverse();
  }, [projects]);

  // No year in the URL: this year if any wedding ends in it, otherwise the newest year.
  const year = f.year || (years.includes(String(yearVN())) ? String(yearVN()) : years[0] ?? "");
  const report = useExpenseReport(year, f.month, f.project);

  const months = useMemo(() => {
    const s = new Set<number>();
    for (const p of projects ?? []) {
      if (year && p.expected_end_date?.startsWith(year)) s.add(parseInt(p.expected_end_date.slice(5, 7), 10));
    }
    return Array.from(s).filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b);
  }, [projects, year]);

  const weddings = useMemo(() => {
    const m = f.month ? f.month.padStart(2, "0") : "";
    return (projects ?? []).filter((p) => {
      if (!p.expected_end_date?.startsWith(year)) return false;
      return !m || p.expected_end_date.slice(5, 7) === m;
    });
  }, [projects, year, f.month]);

  const { rows, summary, categories, isLoading, error } = report;
  const retry = () => { retryList(); report.retry(); };
  const picked = projects?.find((p) => p.name === f.project);
  const periodLabel = picked
    ? picked.project_name || picked.name
    : `${f.month ? `${MONTH_NAMES[Number(f.month) - 1].slice(0, 3)} ` : ""}${year}`;
  const ready = projects !== null && year !== "";

  let body;
  if (error !== null) {
    body = (
      <StatePanel
        kind="error"
        title="Couldn't load the expenses"
        text="The server didn't answer. Your data is safe."
        action={{ label: "Try again", onClick: retry, icon: <RotateCw className="h-4 w-4" /> }}
      />
    );
  } else if (!ready && projects !== null) {
    body = <StatePanel kind="empty" title="No weddings found" text="There are no weddings to report on yet." />;
  } else if (!ready || isLoading) {
    body = (
      <div className="flex flex-col gap-3" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-card md:h-12" />)}
      </div>
    );
  } else if (rows.length === 0 || !summary) {
    body = <StatePanel kind="empty" title="No expenses found" text={f.project ? "This wedding has no recorded expenses yet." : "No expenses are recorded for these weddings yet."} />;
  } else {
    body = (
      <>
        <ExpenseSummary label={periodLabel} summary={summary} categories={categories} />
        {isDesktop ? (
          <ExpenseTable rows={rows} summary={summary} />
        ) : (
          <div className="flex flex-col gap-3">{rows.map((r) => <ExpenseCard key={r.name} row={r} />)}</div>
        )}
      </>
    );
  }

  const canExport = ready && error === null && !isLoading && rows.length > 0;
  const actions = (
    <div className="flex gap-2 print:hidden">
      <Button
        variant="outline"
        className="rounded-full max-md:h-12 md:h-10"
        disabled={!canExport}
        onClick={() => exportExpensesCsv(rows, `wedding-expenses-${f.project || `${year}${f.month ? `-${f.month.padStart(2, "0")}` : ""}`}.csv`)}
      >
        Export CSV
      </Button>
      <Button variant="outline" className="rounded-full max-md:h-12 md:h-10" disabled={!canExport} onClick={() => window.print()}>
        Print
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 pb-6 md:gap-[18px]">
      <ReportsHeader actions={actions} />

      <ExpenseFilters
        years={years}
        months={months}
        weddings={weddings}
        year={year}
        month={f.month}
        project={f.project}
        onYear={(y) => void setF({ year: y, month: "", project: "" })}
        onMonth={(month) => void setF({ month, project: "" })}
        onProject={(project) => void setF({ project })}
      />

      {listError !== null && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card border bg-danger-soft p-3 text-sm text-danger-soft-foreground">
          <span className="mr-auto">Couldn't load the list of weddings, so the pickers may be incomplete.</span>
          <Button variant="outline" size="sm" className="max-md:h-12" onClick={retry}>Try again</Button>
        </div>
      )}

      {body}
    </div>
  );
}
