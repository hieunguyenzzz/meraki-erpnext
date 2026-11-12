import { todayVN } from "@/lib/businessTime";

/** YYYY-MM-DD for display; "—" when empty. Dates from ERPNext are already ISO, so no timezone shift. */
export function isoDate(date: string | null | undefined): string {
  return date ? date.slice(0, 10) : "—";
}

/** "3 years, 8 months" between an ISO joining date and today (business timezone). */
export function tenureLabel(dateOfJoining: string | null | undefined): string {
  if (!dateOfJoining) return "—";
  const [jy, jm, jd] = dateOfJoining.slice(0, 10).split("-").map(Number);
  const [ny, nm, nd] = todayVN().split("-").map(Number);
  let totalMonths = (ny - jy) * 12 + (nm - jm);
  if (nd < jd) totalMonths--;
  if (totalMonths < 0) totalMonths = 0;
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;
  if (y === 0) return m === 1 ? "1 month" : `${m} months`;
  if (m === 0) return y === 1 ? "1 year" : `${y} years`;
  return `${y} year${y > 1 ? "s" : ""}, ${m} month${m > 1 ? "s" : ""}`;
}
