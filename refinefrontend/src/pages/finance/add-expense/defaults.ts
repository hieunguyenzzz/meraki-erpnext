// Pure helpers for the Add Expense defaults: business-day date, default wedding, recent categories.

const RECENTS_KEY = "meraki.expense.recentCategories";
export const CHIP_COUNT = 4;

export interface ExpenseWedding {
  id: string;
  name: string;
  /** ISO date of the wedding, or null when unknown. */
  date: string | null;
  /** Venue name when the data source provides one (searchable only). */
  venue?: string | null;
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

export const MAX_AMOUNT_DIGITS = 12;

/** Keep digits only: no sign, no leading zeros, at most 12 digits. */
export function sanitiseAmount(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^0+/, "").slice(0, MAX_AMOUNT_DIGITS);
}

/** Pasted text such as "1.500.000,00": drop a trailing 1-2 digit decimal part, then keep digits. */
export function parsePastedAmount(text: string): string {
  return sanitiseAmount(text.trim().replace(/[.,]\d{1,2}$/, ""));
}

export function formatAmount(digits: string): string {
  return digits ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
}

/** Lower-case, accent-free text for matching ("Đức" -> "duc"). */
export function normaliseText(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();
}

/** Assigned upcoming weddings first (soonest first), then the rest newest first. */
export function orderWeddings(weddings: ExpenseWedding[], assignedIds: Set<string>, today: string): ExpenseWedding[] {
  const upcomingMine = (w: ExpenseWedding) => assignedIds.has(w.id) && !!w.date && w.date >= today;
  const first = weddings.filter(upcomingMine).sort((a, b) => (a.date as string).localeCompare(b.date as string));
  const rest = weddings.filter((w) => !upcomingMine(w)).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return [...first, ...rest];
}

/** Every word of the query must appear in the couple/project name or venue. */
export function searchWeddings(ordered: ExpenseWedding[], query: string): ExpenseWedding[] {
  const words = normaliseText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return ordered;
  return ordered.filter((w) => {
    const hay = normaliseText(`${w.name} ${w.venue ?? ""}`);
    return words.every((word) => hay.includes(word));
  });
}
