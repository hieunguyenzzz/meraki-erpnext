import { formatDate, formatVND } from "@/lib/format";

/** Normalise API review_reasons (newline string or array) to a list. */
export function reviewReasonList(reasons: string | string[] | null | undefined): string[] {
  if (!reasons) return [];
  const list = Array.isArray(reasons) ? reasons : reasons.split("\n");
  return list.map((r) => r.trim()).filter(Boolean);
}

/** "02 Oct 2026 06:00" (24h), sliced from the string so no timezone shift is applied. */
export function formatDateTime24(value: string | null | undefined): string {
  if (!value) return "-";
  const s = value.replace("T", " ");
  const time = s.length >= 16 ? s.slice(11, 16) : "";
  return `${formatDate(s.slice(0, 10))}${time ? ` ${time}` : ""}`;
}

export function formatTime24(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(11, 16) || "-";
}

export function formatAmount(amount: number | null | undefined, currency: string | null | undefined): string {
  if (!currency || currency === "VND") return formatVND(amount);
  const n = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount ?? 0);
  return `${currency} ${n}`;
}

const SYNC_TZ = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** Sync-run timestamps are ISO strings (UTC unless they carry an offset); show them in Asia/Ho_Chi_Minh, 24h. */
export function formatSyncTime(value: string | null | undefined): string {
  if (!value) return "-";
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(value);
  const d = new Date(hasZone ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return value;
  const part = (t: string) => SYNC_TZ.formatToParts(d).find((p) => p.type === t)?.value ?? "";
  return `${part("day")} ${part("month")} ${part("year")} ${part("hour")}:${part("minute")}`;
}
