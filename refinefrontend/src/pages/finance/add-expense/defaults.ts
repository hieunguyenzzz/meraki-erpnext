// Pure helpers for the Add Expense defaults: business-day date, default wedding, recent categories.

const TZ = "Asia/Ho_Chi_Minh";
const RECENTS_KEY = "meraki.expense.recentCategories";
export const CHIP_COUNT = 4;

export interface ExpenseWedding {
  id: string;
  name: string;
  /** ISO date of the wedding, or null when unknown. */
  date: string | null;
}

/** Today's date (YYYY-MM-DD) in the business timezone, regardless of the device timezone. */
export function todayVN(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

/** The assigned wedding happening today, else the next upcoming one; null when none is current. */
export function pickDefaultWedding(assigned: ExpenseWedding[], today: string): string | null {
  const upcoming = assigned
    .filter((w) => w.date && w.date >= today)
    .sort((a, b) => (a.date as string).localeCompare(b.date as string));
  return upcoming[0]?.id ?? null;
}

export function loadRecents(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Move a category to the front of the per-device recents list. */
export function rememberCategory(name: string): void {
  try {
    const next = [name, ...loadRecents().filter((c) => c !== name)].slice(0, 8);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode): recents are only a convenience
  }
}

/** Chip names: recents first (still-valid ones), topped up with the first categories. */
export function chipNames(all: string[], recents: string[]): string[] {
  const valid = recents.filter((r) => all.includes(r));
  return [...valid, ...all.filter((c) => !valid.includes(c))].slice(0, CHIP_COUNT);
}

export function formatAmount(digits: string): string {
  return digits ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
}
