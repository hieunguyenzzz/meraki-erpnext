import { formatIsoWeekday, formatVNDFull } from "@/lib/format";
import { Calendar, Home, Receipt, MessageSquare, Users, Heart, User, Bell, type LucideIcon } from "lucide-react";
import { todayVN } from "@/lib/businessTime";
import type { PwaNotification } from "@/hooks/useMyNotifications";

export const DOC_ROUTES: Record<string, (name: string) => string> = {
  "Job Applicant": (name) => `/hr/recruiting/${encodeURIComponent(name)}`,
  "Lead": (name) => `/crm/leads/${encodeURIComponent(name)}`,
  "Employee": (name) => `/hr/employees/${encodeURIComponent(name)}`,
  "Project": (name) => `/projects/${encodeURIComponent(name)}`,
  "Purchase Invoice": (name) => `/finance/expenses/${encodeURIComponent(name)}`,
  "Attendance Request": () => "/hr/wfh",
};

type Tone = "warning" | "info" | "accent" | "muted";

interface TypeMeta {
  label: string;
  icon: LucideIcon;
  tone: Tone;
}

const TYPE_META: Record<string, TypeMeta> = {
  "Leave Application": { label: "Leave", icon: Calendar, tone: "warning" },
  "Attendance Request": { label: "WFH", icon: Home, tone: "info" },
  "Purchase Invoice": { label: "Expenses", icon: Receipt, tone: "accent" },
  "Lead": { label: "Leads", icon: MessageSquare, tone: "accent" },
  "Job Applicant": { label: "Recruiting", icon: Users, tone: "muted" },
  "Project": { label: "Weddings", icon: Heart, tone: "accent" },
  "Employee": { label: "Employees", icon: User, tone: "muted" },
};

export const TONE_CLASSES: Record<Tone, string> = {
  warning: "bg-warning-soft text-warning-soft-foreground",
  info: "bg-info-soft text-info-soft-foreground",
  accent: "bg-accent text-accent-foreground",
  muted: "bg-secondary text-muted-foreground",
};

export const metaForType = (type: string): TypeMeta =>
  TYPE_META[type] ?? { label: type || "Notice", icon: Bell, tone: "muted" };

/** Chips on the Notifications page, in this order; each shows even with nothing new. */
export const FILTER_TYPES = [
  "Purchase Invoice", "Leave Application", "Attendance Request", "Job Applicant", "Lead", "Project", "Employee",
];

export const labelForType = (type: string) => metaForType(type).label;

/** Leave, WFH and expense approvals get titles, facts and a current state from the backend. */
export const needsDetails = (type: string) =>
  type === "Leave Application" || type === "Attendance Request" || type === "Purchase Invoice";

export type ApprovalAction = "approve" | "reject";

/** Leave/WFH approve/reject endpoints are HR-only; expense (Purchase Invoice) ones are Finance-only, and only Finance receives those notifications. */
export function canDecide(notif: PwaNotification, isHr: boolean): boolean {
  if (!notif.is_pending) return false;
  const type = notif.reference_document_type;
  if (type === "Leave Application" || type === "Attendance Request") return isHr;
  return type === "Purchase Invoice";
}

export interface MessagePart {
  text: string;
  bold: boolean;
}

/** Amounts arrive as "85,000 ₫"; the house style is "VND 85.000". */
const withVndPrefix = (text: string) =>
  text.replace(/([\d][\d,.]*)\s*₫/g, (_m, digits: string) => formatVNDFull(Number(digits.replace(/[,.]/g, ""))));

/**
 * Split a notification's HTML message into text parts, keeping only <b>/<strong> emphasis.
 * DOMParser builds an inert document (no script/img loading) and nothing is re-inserted as HTML.
 */
export function parseMessage(html: string): MessagePart[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const parts: MessagePart[] = [];
  const walk = (node: Node, bold: boolean) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = withVndPrefix(child.textContent ?? "");
        if (text) parts.push({ text, bold });
      } else if (child instanceof Element) {
        const tag = child.tagName.toLowerCase();
        walk(child, bold || tag === "b" || tag === "strong");
      }
    });
  };
  walk(doc.body, false);
  return parts;
}

/** "YYYY-MM-DD" from an ERPNext timestamp ("2026-11-03 09:41:12.345"), as the server wrote it. */
export const isoDay = (creation: string) => creation.slice(0, 10);
/** 24h "HH:mm" from an ERPNext timestamp. */
export const clockTime = (creation: string) => creation.slice(11, 16);

export function dayLabel(creation: string): string {
  const day = isoDay(creation);
  // Server timestamps are Vietnam time, so compare against Vietnam dates, not the device clock
  if (day === todayVN()) return "Today";
  if (day === todayVN(new Date(Date.now() - 86_400_000))) return "Yesterday";
  return formatIsoWeekday(day);
}

export function groupByDay(items: PwaNotification[]): { label: string; items: PwaNotification[] }[] {
  const map = new Map<string, PwaNotification[]>();
  for (const n of items) {
    const label = dayLabel(n.creation);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(n);
  }
  return [...map].map(([label, list]) => ({ label, items: list }));
}

/** Where the underlying request stands now; "removed" = the record no longer exists. */
export type RequestState = "pending" | "approved" | "rejected" | "cancelled" | "removed";

interface DetailsBase {
  state?: RequestState;
  /** Short human title and the bell's one-line summary, built by the backend. */
  title?: MessagePart[] | null;
  compact?: MessagePart[] | null;
}

export type NotificationDetails = DetailsBase &
  (
  | {
      kind: "leave"; employee_name?: string; leave_type?: string; from_date?: string; to_date?: string;
      days?: number | null; half_day?: boolean; days_left_after?: number | null;
    }
  | {
      kind: "wfh"; employee_name?: string; from_date?: string; to_date?: string; half_day?: boolean;
      days?: number | null; reason?: string | null;
    }
  | { kind: "expense"; submitter?: string | null; amount?: number | null; wedding?: string | null; has_bill?: boolean }
  );

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function dateRange(d: { from_date?: string; to_date?: string }): string | null {
  if (!d.from_date) return null;
  return d.to_date && d.to_date !== d.from_date ? `${d.from_date} → ${d.to_date}` : d.from_date;
}

export interface Fact {
  label: string;
  value: string;
}

/** Labelled facts for the approval card's fact strip (desktop). */
export function factStrip(d: NotificationDetails): Fact[] {
  if (d.state === "removed") return [];
  const facts: (Fact | null)[] = [];
  if (d.kind === "leave") {
    facts.push(
      d.leave_type ? { label: "Type", value: d.leave_type } : null,
      dateRange(d) ? { label: "Dates", value: dateRange(d)! } : null,
      d.days != null ? { label: "Days", value: String(d.days) } : null,
      { label: "Half day", value: d.half_day ? "Yes" : "No" },
    );
  } else if (d.kind === "wfh") {
    const single = d.from_date && (!d.to_date || d.to_date === d.from_date);
    facts.push(
      dateRange(d) ? { label: "Dates", value: single ? formatIsoWeekday(d.from_date) : dateRange(d)! } : null,
      d.days != null ? { label: "Days", value: String(d.days) } : null,
      d.half_day ? { label: "Half day", value: "Yes" } : null,
    );
  } else {
    facts.push(
      d.amount != null ? { label: "Amount", value: formatVNDFull(d.amount) } : null,
      d.wedding ? { label: "Wedding", value: d.wedding } : null,
      d.submitter ? { label: "Submitted by", value: d.submitter } : null,
      { label: "Bill", value: d.has_bill ? "Attached" : "None" },
    );
  }
  return facts.filter((f): f is Fact => f !== null);
}

/** Short facts for the phone card, e.g. ["Annual Leave", "2026-12-21 → 2026-12-22", "2 days"]. */
export function detailFacts(d: NotificationDetails): string[] {
  if (d.state === "removed") return [];
  if (d.kind === "expense") return factStrip(d).filter((f) => f.label !== "Submitted by").map((f) => (f.label === "Bill" ? `Bill ${f.value.toLowerCase()}` : f.value));
  const facts: string[] = [];
  if (d.kind === "leave" && d.leave_type) facts.push(d.leave_type);
  const range = dateRange(d);
  if (range) facts.push(range);
  if (d.kind === "leave" && d.days != null) facts.push(plural(d.days, "day"));
  if (d.half_day) facts.push("Half day");
  return facts;
}

export interface ContextLine {
  text: string;
  /** "success" = the green balance pill; "warning" = overdrawn; "muted" = the grey reason box. */
  tone: "success" | "warning" | "muted";
}

/** The one line that helps decide: leave balance after the request (or by how much it is overdrawn), or the WFH reason. */
export function contextLine(d: NotificationDetails | undefined, short = false): ContextLine | null {
  if (d?.kind === "leave" && d.days_left_after != null && d.days_left_after < 0) {
    return { text: `Over balance by ${plural(-d.days_left_after, "day")}`, tone: "warning" };
  }
  if (d?.kind === "leave" && d.days_left_after != null) {
    return { text: `${plural(d.days_left_after, "day")} left after ${short ? "this" : "this request"}`, tone: "success" };
  }
  if (d?.kind === "wfh" && d.reason) return { text: `Reason: “${d.reason}”`, tone: "muted" };
  return null;
}

const REF_ID = /\s*:?\s*(HR-[A-Z]+-[\d-]+|ACC-[A-Z]+-[\d-]+)/g;

/** The original subject as text parts, minus raw record IDs. */
function subjectParts(notif: PwaNotification): MessagePart[] {
  return parseMessage(notif.message).map((p) => ({ ...p, text: p.text.replace(REF_ID, "") }));
}

/** Page title: the backend's short title when it built one, else the original subject. */
export function titleParts(notif: PwaNotification, details?: NotificationDetails): MessagePart[] {
  return details?.title ?? subjectParts(notif);
}

/** Bell line: the backend's compact summary when it built one, else the original subject. */
export function compactMessage(notif: PwaNotification, details?: NotificationDetails): MessagePart[] {
  return details?.compact ?? subjectParts(notif);
}

const STATE_NOTE: Record<Exclude<RequestState, "pending">, { label: string; variant: "success" | "destructive" | "secondary" }> = {
  approved: { label: "Approved", variant: "success" },
  rejected: { label: "Rejected", variant: "destructive" },
  cancelled: { label: "Already handled", variant: "secondary" },
  removed: { label: "Already handled", variant: "secondary" },
};

/** Small badge for a request that is no longer waiting on anyone; null while it is pending or unknown. */
export function stateNote(details?: NotificationDetails) {
  return details?.state && details.state !== "pending" ? STATE_NOTE[details.state] : null;
}
