import { createParser } from "nuqs";
import { todayVN } from "@/lib/businessTime";

/** First day of the business-timezone current month, e.g. "2026-11-01". */
export function currentMonthStart(): string {
  return `${todayVN().slice(0, 7)}-01`;
}

/** Month shown as "2026-10" (ISO order, no month names). */
export function monthLabel(startDate: string): string {
  return startDate.slice(0, 7);
}

export function isMonthStart(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-01$/.exec(v);
  return !!m && Number(m[2]) >= 1 && Number(m[2]) <= 12;
}

/** `?month=` must be a real first-of-month date; anything else falls back to the current month. */
export const monthParser = createParser<string>({ parse: (v) => (isMonthStart(v) ? v : null), serialize: (v) => v });

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
