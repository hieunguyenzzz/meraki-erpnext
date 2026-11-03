import { daysUntilVN, todayVN } from "@/lib/businessTime";
import { formatIsoWeekday } from "@/lib/format";

export interface DateRange {
  from: string;
  to: string;
}

/** Both windows span 90 days, so Previous from Upcoming lands exactly on Past. */
export const WINDOW_DAYS = 90;

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function upcomingRange(today: string = todayVN()): DateRange {
  return { from: today, to: addDays(today, WINDOW_DAYS - 1) };
}

export function pastRange(today: string = todayVN()): DateRange {
  return { from: addDays(today, -WINDOW_DAYS), to: addDays(today, -1) };
}

/** Move the window by its own length, forwards (+1) or backwards (-1). */
export function shiftRange(r: DateRange, direction: 1 | -1): DateRange {
  const span = Math.max(1, daysUntilVN(r.to) - daysUntilVN(r.from) + 1);
  return { from: addDays(r.from, direction * span), to: addDays(r.to, direction * span) };
}

/** "Today" / "Tomorrow" / "Sat 2026-11-14" for an agenda date header. */
export function dayLabel(iso: string): { main: string; date?: string } {
  const diff = daysUntilVN(iso);
  if (diff === 0) return { main: "Today", date: formatIsoWeekday(iso) };
  if (diff === -1) return { main: "Yesterday", date: formatIsoWeekday(iso) };
  if (diff === 1) return { main: "Tomorrow", date: formatIsoWeekday(iso) };
  return { main: formatIsoWeekday(iso) };
}

/** True only for a real calendar date written YYYY-MM-DD ("2026-02-30" and "garbage" are not). */
export function isIsoDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && addDays(v, 0) === v;
}
