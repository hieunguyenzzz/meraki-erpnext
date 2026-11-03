import DOMPurify from "dompurify";
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

const QUOTE_SELECTOR = "blockquote, .gmail_quote, .zmail_extra, #divRplyFwdMsg, #appendonsend";
const ON_WROTE = /On\s.{3,200}?\swrote:/;

/** Email HTML made safe, with links opening in a new tab. The hook is scoped to this call. */
export function sanitizeEmail(html: string): string {
  const hook = (node: Element) => {
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  };
  DOMPurify.addHook("afterSanitizeAttributes", hook);
  try {
    return DOMPurify.sanitize(html);
  } finally {
    DOMPurify.removeHook("afterSanitizeAttributes", hook);
  }
}

type Marker = { node: Node; offset?: number };

/** Earliest quote marker in document order, nested or not. */
function findQuoteStart(body: HTMLElement): Marker | null {
  const found: Marker[] = [];

  const el = body.querySelector(QUOTE_SELECTOR);
  if (el) found.push({ node: el });

  // A rule followed by "From:" is how Outlook starts a quoted reply.
  for (const hr of Array.from(body.querySelectorAll("hr"))) {
    let next: Node | null = hr.nextSibling;
    while (next && next.nodeType === Node.TEXT_NODE && !next.textContent?.trim()) next = next.nextSibling;
    if (next?.textContent?.trim().startsWith("From:")) {
      found.push({ node: hr });
      break;
    }
  }

  // "On <date>, <name> wrote:" line.
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const m = ON_WROTE.exec(t.textContent ?? "");
    if (m) {
      found.push({ node: t, offset: m.index });
      break;
    }
  }

  if (!found.length) return null;
  return found.reduce((a, b) =>
    a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_PRECEDING ? b : a,
  );
}

/**
 * Splits an email body at the first quote marker, however deeply nested, into new text and the
 * quoted history. Each piece is sanitised after the split. A body that is only quote stays whole.
 */
export function splitQuoted(rawHtml: string): { main: string; quoted: string } {
  const whole = { main: sanitizeEmail(rawHtml), quoted: "" };
  const body = new DOMParser().parseFromString(rawHtml, "text/html").body;
  const marker = findQuoteStart(body);
  if (!marker) return whole;

  const range = document.createRange();
  if (marker.offset !== undefined) range.setStart(marker.node, marker.offset);
  else range.setStartBefore(marker.node);
  range.setEndAfter(body.lastChild ?? body);
  const tail = document.createElement("div");
  tail.appendChild(range.extractContents());

  if (!(body.textContent || "").trim()) return whole;
  return { main: sanitizeEmail(body.innerHTML), quoted: sanitizeEmail(tail.innerHTML) };
}
