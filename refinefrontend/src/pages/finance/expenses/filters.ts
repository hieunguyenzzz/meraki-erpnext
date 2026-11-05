import { createParser, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { STATUSES, categoryLabel, expenseStatus, isoDay, type Expense, type RowInfo } from "./types";

/** A real calendar date as YYYY-MM-DD; anything else in the URL falls back to "no date". */
const isoDate = createParser<string>({
  parse: (v) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
    const d = new Date(`${v}T00:00:00Z`);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
  },
  serialize: (v) => v,
});

export const filterParsers = {
  q: parseAsString.withDefault(""),
  status: parseAsStringLiteral(STATUSES),
  category: parseAsString.withDefault(""),
  wedding: parseAsString.withDefault(""),
  staff: parseAsString.withDefault(""),
  from: isoDate,
  to: isoDate,
  bill: parseAsStringLiteral(["missing"] as const),
};

export function useExpenseFilters() {
  return useQueryStates(filterParsers, { clearOnDefault: true });
}

export interface Filters {
  q: string;
  status: (typeof STATUSES)[number] | null;
  category: string;
  wedding: string;
  staff: string;
  from: string | null;
  to: string | null;
  bill: "missing" | null;
}

interface Context {
  info: Record<string, RowInfo>;
  weddingNames: Record<string, string>;
  /** PI names that have a receipt; null while unknown (then the missing-bill filter is ignored). */
  withReceipt: Set<string> | null;
}

export function filterExpenses(rows: Expense[], f: Filters, ctx: Context): Expense[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter((e) => {
    if (f.status && expenseStatus(e) !== f.status) return false;
    if (f.category && e.against_expense_account !== f.category) return false;
    if (f.wedding && e.project !== f.wedding) return false;
    if (f.staff && (ctx.info[e.name]?.staff ?? "") !== f.staff) return false;
    const day = isoDay(e.posting_date);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    if (f.bill === "missing" && ctx.withReceipt && ctx.withReceipt.has(e.name)) return false;
    if (q) {
      const hay = [
        e.name, e.supplier_name, categoryLabel(e.against_expense_account),
        ctx.weddingNames[e.project] ?? e.project, ctx.info[e.name]?.description, ctx.info[e.name]?.staff, ctx.info[e.name]?.note,
      ].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
