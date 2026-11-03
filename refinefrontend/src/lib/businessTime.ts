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
