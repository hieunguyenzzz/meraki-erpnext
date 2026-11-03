/** The business runs on Vietnam time; dates and time-of-day on screen follow it, not the device clock. */
export const BUSINESS_TZ = "Asia/Ho_Chi_Minh";

/** Date (YYYY-MM-DD) in the business timezone, regardless of the device timezone. */
export function todayVN(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TZ }).format(now);
}

/** Hour of day (0-23) in the business timezone. */
export function hourVN(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TZ, hour: "2-digit", hourCycle: "h23" }).format(now));
}

/** Calendar year in the business timezone. */
export function yearVN(now: Date = new Date()): number {
  return Number(todayVN(now).slice(0, 4));
}

/** Clock time (HH:MM, 24 h) in the business timezone. */
export function nowTimeVN(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
}

/** Whole calendar days from today (business timezone) to `isoDate`; negative once it has passed. */
export function daysUntilVN(isoDate: string, now: Date = new Date()): number {
  const target = Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${todayVN(now)}T00:00:00Z`);
  return Math.round((target - today) / 86_400_000);
}
