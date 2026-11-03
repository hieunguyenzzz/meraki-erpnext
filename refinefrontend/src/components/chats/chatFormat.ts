import { todayVN } from "@/lib/businessTime";

/**
 * Frappe returns naive "YYYY-MM-DD HH:mm:ss" stamps already in the site's clock, so the date and
 * time are read straight from the string. Re-parsing through Date would shift them to the device zone.
 */
function parts(stamp: string): { date: string; time: string } {
  const s = stamp.replace("T", " ");
  return { date: s.slice(0, 10), time: s.slice(11, 16) };
}

function yesterdayOf(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/** Calendar day (YYYY-MM-DD) of a stamp. */
export function stampDay(stamp: string): string {
  return parts(stamp).date;
}

/** 24h time of a stamp, e.g. "08:40". */
export function stampTime(stamp: string): string {
  return parts(stamp).time;
}

/** List rows: time for today's messages, ISO date otherwise. */
export function listStamp(stamp: string): string {
  const { date, time } = parts(stamp);
  return date === todayVN() ? time : date;
}

/** Day separator: "Today", "Yesterday" or the ISO date. */
export function dayLabel(isoDate: string): string {
  const today = todayVN();
  if (isoDate === today) return "Today";
  if (isoDate === yesterdayOf(today)) return "Yesterday";
  return isoDate;
}

export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

const TONES = [
  "bg-accent text-accent-foreground",
  "bg-info-soft text-info-soft-foreground",
  "bg-success-soft text-success-soft-foreground",
  "bg-warning-soft text-warning-soft-foreground",
];

/** Stable avatar colour per name, from the redesign tokens. */
export function avatarTone(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

/** Splits an email body into the new text and the quoted history (first blockquote onwards). */
export function splitQuoted(safeHtml: string): { main: string; quoted: string } {
  const body = new DOMParser().parseFromString(safeHtml, "text/html").body;
  const first = body.querySelector("blockquote, .gmail_quote, .zmail_extra");
  if (!first) return { main: safeHtml, quoted: "" };

  const quotedNodes: Element[] = [];
  for (let n: Element | null = first; n; n = n.nextElementSibling) quotedNodes.push(n);
  // Only top-level quotes can be cut off cleanly; a nested one is left inline.
  if (first.parentElement !== body) return { main: safeHtml, quoted: "" };
  const quoted = quotedNodes.map((n) => n.outerHTML).join("");
  quotedNodes.forEach((n) => n.remove());
  if (!(body.textContent || "").trim()) return { main: safeHtml, quoted: "" };
  return { main: body.innerHTML, quoted };
}
