import { BUSINESS_TZ, todayVN } from "@/lib/businessTime";

export function displayName(person: { first_name?: string | null; last_name?: string | null; employee_name?: string | null }): string {
  const parts = [person.last_name, person.first_name].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : (person.employee_name || "");
}

export function formatVND(amount: number | undefined | null): string {
  if (amount == null) return "0 ₫";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}

const GROUPED = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

/** Exact amount with the ISO prefix, e.g. "VND 3,592,937,098". */
export function formatVNDFull(amount: number | undefined | null): string {
  const n = amount ?? 0;
  return `${n < 0 ? "-" : ""}VND ${GROUPED.format(Math.abs(n))}`;
}

/**
 * Short amount for tiles: >= 1 B -> "VND 3.59 B" (2 decimals), >= 1 M -> "VND 482 M" (none),
 * below that the exact amount. Pair with formatVNDFull in a title/tap-to-reveal.
 */
export function formatVNDCompact(amount: number | undefined | null): string {
  const n = amount ?? 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  // Choose the unit after rounding, so 999,500,000 reads "1.00 B" rather than "1,000 M".
  if (abs >= 999_500_000) return `${sign}VND ${(abs / 1e9).toFixed(2)} B`;
  if (abs >= 1e6) return `${sign}VND ${GROUPED.format(abs / 1e6)} M`;
  return formatVNDFull(n);
}

/** Chart axis label in millions, e.g. "450 M" (no currency, the chart title carries it). */
export function formatMillions(amount: number): string {
  return `${GROUPED.format(Math.round(amount / 1e6) + 0)} M`; // + 0 turns -0 into 0
}

/** "Friday 2026-10-30" for the Home greeting (business timezone, ISO order). */
export function formatWeekdayIso(date: Date): string {
  const weekday = date.toLocaleDateString("en-GB", { weekday: "long", timeZone: BUSINESS_TZ });
  return `${weekday} ${todayVN(date)}`;
}

export function formatDate(date: string | undefined | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(date: string | undefined | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
