import { useEffect, useMemo, useRef } from "react";
import { createParser, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { RotateCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatePanel } from "@/components/StatePanel";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { yearVN } from "@/lib/businessTime";
import { formatVNDFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ReportsHeader } from "./ReportsHeader";
import { ExpenseFilters } from "./expenses/ExpenseFilters";
import { ExpenseCard, ExpenseTable, GroupHeader } from "./expenses/ExpenseRows";
import { GROUPS, GROUP_LABEL, type ExpenseGroup } from "./expenses/types";
import { useExpenseReport } from "./expenses/useExpenseReport";

const year4 = createParser<string>({ parse: (v) => (/^\d{4}$/.test(v) ? v : null), serialize: (v) => v });
const month12 = createParser<string>({ parse: (v) => (/^(?:[1-9]|1[0-2])$/.test(v) ? v : null), serialize: (v) => v });
const parsers = {
  year: year4.withDefault(""),
  month: month12.withDefault(""),
  project: parseAsString.withDefault(""),
  group: parseAsStringLiteral(GROUPS).withDefault("all"),
};

export default function WeddingExpenseReportPage() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  // Filters live in the URL so Back restores them; junk values fall back to the defaults.
  const [f, setF] = useQueryStates(parsers, { clearOnDefault: true });
  const { projects, rows, summary, isLoading, error, retry } = useExpenseReport(f.project);
  const defaulted = useRef(false);

  // First visit with no filters: default to the current year if any wedding ends in it.
  useEffect(() => {
    if (defaulted.current || !projects) return;
    defaulted.current = true;
    if (f.year || f.project) return;
    const y = String(yearVN());
    if (projects.some((p) => p.expected_end_date?.startsWith(y))) void setF({ year: y });
  }, [projects, f.year, f.project, setF]);

  const years = useMemo(() => {
    const s = new Set<string>();
    for (const p of projects ?? []) {
      const y = p.expected_end_date?.slice(0, 4);
      if (y) s.add(y);
    }
    return Array.from(s).sort().reverse();
  }, [projects]);

  const months = useMemo(() => {
    if (!f.year) return [];
    const s = new Set<number>();
    for (const p of projects ?? []) {
      if (p.expected_end_date?.startsWith(f.year)) {
        const m = parseInt(p.expected_end_date.slice(5, 7), 10);
        if (m >= 1 && m <= 12) s.add(m);
      }
    }
    return Array.from(s).sort((a, b) => a - b);
  }, [projects, f.year]);

  const weddings = useMemo(() => {
    const m = f.month ? f.month.padStart(2, "0") : "";
    return (projects ?? []).filter((p) => {
      if (!p.expected_end_date) return false;
      if (f.year && !p.expected_end_date.startsWith(f.year)) return false;
      return !m || p.expected_end_date.slice(5, 7) === m;
    });
  }, [projects, f.year, f.month]);

  const groups = useMemo<ExpenseGroup[] | null>(() => {
    if (f.group === "all") return null;
    const map = new Map<string, ExpenseGroup>();
    for (const row of rows) {
      const label = f.group === "category" ? row.category_label || "Uncategorized" : row.posting_date.slice(0, 10);
      if (!map.has(label)) map.set(label, { label, rows: [], subtotal: 0 });
      const g = map.get(label)!;
      g.rows.push(row);
      g.subtotal += row.amount;
    }
    return Array.from(map.values());
  }, [rows, f.group]);

  const weddingName = projects?.find((p) => p.name === f.project);

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
  } else if (!f.project) {
    body = <StatePanel kind="empty" title="Select a wedding" text="Pick a year, month and wedding to see its expenses." />;
  } else if (isLoading) {
    body = (
      <div className="flex flex-col gap-3" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-card md:h-12" />)}
      </div>
    );
  } else if (rows.length === 0) {
    body = <StatePanel kind="empty" title="No expenses found" text="This wedding has no recorded expenses yet." />;
  } else if (isDesktop) {
    body = <ExpenseTable rows={rows} groups={groups} summary={summary} />;
  } else if (groups) {
    body = (
      <div className="flex flex-col gap-3">
        {groups.map((g) => (
          <section key={g.label} className="flex flex-col gap-2">
            <GroupHeader g={g} />
            {g.rows.map((r) => <ExpenseCard key={r.name} row={r} />)}
          </section>
        ))}
      </div>
    );
  } else {
    body = <div className="flex flex-col gap-3">{rows.map((r) => <ExpenseCard key={r.name} row={r} />)}</div>;
  }

  const showResults = f.project !== "" && error === null && !isLoading && rows.length > 0;

  return (
    <div className="flex flex-col gap-4 pb-6">
      <ReportsHeader />

      <ExpenseFilters
        years={years}
        months={months}
        weddings={weddings}
        year={f.year}
        month={f.month}
        project={f.project}
        onYear={(year) => void setF({ year, month: "", project: "" })}
        onMonth={(month) => void setF({ month, project: "" })}
        onProject={(project) => void setF({ project })}
      />

      {showResults && summary && (
        <section aria-label="Totals" className="flex flex-col gap-1 rounded-card border bg-card p-4 tabular-nums">
          <div className="text-sm text-muted-foreground">
            Total{weddingName ? ` · ${weddingName.project_name || weddingName.name}` : ""} · {summary.count} {summary.count === 1 ? "expense" : "expenses"}
          </div>
          <div className="text-[28px] font-bold leading-9">{formatVNDFull(summary.total)}</div>
          {summary.pending > 0 && (
            <div className="text-sm text-muted-foreground">
              {formatVNDFull(summary.approved)} approved · {formatVNDFull(summary.pending)} pending approval
            </div>
          )}
        </section>
      )}

      {showResults && (
        <div role="group" aria-label="Group expenses" className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          {GROUPS.map((g) => {
            const on = f.group === g;
            return (
              <button
                key={g}
                type="button"
                aria-pressed={on}
                onClick={() => void setF({ group: g })}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center rounded-full border px-4 text-sm font-medium max-md:h-12",
                  on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                )}
              >
                {GROUP_LABEL[g]}
              </button>
            );
          })}
        </div>
      )}

      {body}
    </div>
  );
}
