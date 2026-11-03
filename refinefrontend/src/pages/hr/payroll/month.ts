import { createParser } from "nuqs";
import { todayVN } from "@/lib/businessTime";

/** First day of the business-timezone current month, e.g. "2026-11-01". */
export function currentMonthStart(): string {
  return `${todayVN().slice(0, 7)}-01`;
}

/** Month shown as "2026-10" (ISO order); an entry that does not start on the 1st also shows its exact start date. */
export function monthLabel(startDate: string): string {
  return startDate.endsWith("-01") ? startDate.slice(0, 7) : `${startDate.slice(0, 7)} (from ${startDate})`;
}

/** A real calendar date, YYYY-MM-DD. */
export function isIsoDate(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** `?month=` must be a real date; the page then only accepts it if it matches a payroll entry or a recent month. */
export const monthParser = createParser<string>({ parse: (v) => (isIsoDate(v) ? v : null), serialize: (v) => v });

export function lastDayOfMonth(startDate: string): string {
  const [y, m] = startDate.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${startDate.slice(0, 7)}-${String(d).padStart(2, "0")}`;
}

/** The 12 months up to and including the current one, newest first. */
export function recentMonthStarts(): string[] {
  const [y, m] = currentMonthStart().split("-").map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  });
}
