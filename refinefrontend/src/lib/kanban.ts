export type ColumnKey = "new" | "engaged" | "converted" | "lost";

export interface KanbanItem {
  id: string;          // doctype name (unique ID)
  doctype: "Lead" | "Opportunity";
  displayName: string; // lead_name or party_name
  status: string;
  email?: string;
  phone?: string;
  creation: string;
  lastActivity?: {
    date: string;                    // ISO timestamp of last communication
    waitingFor: "client" | "staff";  // Sent by staff → waiting for client, Received → waiting for staff
  };
}

export interface ColumnDef {
  key: ColumnKey;
  label: string;
  /** HSL color class prefix: blue, amber, green, rose */
  color: string;
  leadStatuses: string[];
  oppStatuses: string[];
  /** Status to set when dropping a Lead into this column */
  leadTarget: string;
  /** Status to set when dropping an Opportunity into this column */
  oppTarget: string;
}

export const COLUMNS: ColumnDef[] = [
  {
    key: "new",
    label: "New",
    color: "blue",
    leadStatuses: ["Lead", "Open"],
    oppStatuses: ["Open"],
    leadTarget: "Open",
    oppTarget: "Open",
  },
  {
    key: "engaged",
    label: "Engaged",
    color: "amber",
    leadStatuses: ["Replied", "Interested"],
    oppStatuses: ["Replied"],
    leadTarget: "Replied",
    oppTarget: "Replied",
  },
  {
    key: "converted",
    label: "Converted",
    color: "green",
    leadStatuses: ["Opportunity", "Converted", "Quotation"],
    oppStatuses: ["Quotation", "Converted"],
    leadTarget: "Converted",
    oppTarget: "Converted",
  },
  {
    key: "lost",
    label: "Lost",
    color: "rose",
    leadStatuses: ["Lost Quotation", "Do Not Contact"],
    oppStatuses: ["Lost", "Closed"],
    leadTarget: "Do Not Contact",
    oppTarget: "Lost",
  },
];

export function getColumnForItem(item: KanbanItem): ColumnKey {
  for (const col of COLUMNS) {
    const statuses = item.doctype === "Lead" ? col.leadStatuses : col.oppStatuses;
    if (statuses.includes(item.status)) return col.key;
  }
  // Default: "new" column for unknown statuses
  return "new";
}

export function getTargetStatus(col: ColumnDef, doctype: "Lead" | "Opportunity"): string {
  return doctype === "Lead" ? col.leadTarget : col.oppTarget;
}

export function buildKanbanItems(
  leads: any[],
  opportunities: any[],
): KanbanItem[] {
  const items: KanbanItem[] = [];
  for (const l of leads) {
    items.push({
      id: `Lead::${l.name}`,
      doctype: "Lead",
      displayName: l.lead_name || l.name,
      status: l.status,
      email: l.email_id,
      phone: l.phone,
      creation: l.creation,
    });
  }
  for (const o of opportunities) {
    items.push({
      id: `Opportunity::${o.name}`,
      doctype: "Opportunity",
      displayName: o.party_name || o.name,
      status: o.status,
      email: o.contact_email,
      phone: o.contact_mobile,
      creation: o.creation,
    });
  }
  return items;
}

/** Statuses where ERPNext won't allow backward transitions */
const LOCKED_LEAD_STATUSES = new Set(["Opportunity", "Converted"]);
const LOCKED_OPP_STATUSES = new Set(["Converted", "Lost", "Closed"]);

export function isItemLocked(item: KanbanItem): boolean {
  if (item.doctype === "Lead") return LOCKED_LEAD_STATUSES.has(item.status);
  return LOCKED_OPP_STATUSES.has(item.status);
}

/** Extract ERPNext document name from KanbanItem id ("Lead::CRM-LEAD-00001" -> "CRM-LEAD-00001") */
export function getDocName(item: KanbanItem): string {
  return item.id.split("::")[1];
}

/** Format how long ago a timestamp occurred (e.g. "<1h", "5h", "3d") */
export function formatAge(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "<1h";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/** Get hours elapsed since a timestamp */
export function hoursElapsed(timestamp: string): number {
  return (Date.now() - new Date(timestamp).getTime()) / 3_600_000;
}

/** Merge latest Communication data into kanban items */
export function enrichWithActivity(
  items: KanbanItem[],
  communications: any[], // ERPNext Communication records, pre-sorted desc
): KanbanItem[] {
  const latestByRef = new Map<string, { date: string; waitingFor: "client" | "staff" }>();
  for (const c of communications) {
    const key = `${c.reference_doctype}::${c.reference_name}`;
    if (!latestByRef.has(key)) {
      latestByRef.set(key, {
        date: c.communication_date || c.creation,
        waitingFor: c.sent_or_received === "Sent" ? "client" : "staff",
      });
    }
  }
  return items.map(item => ({
    ...item,
    lastActivity: latestByRef.get(item.id),
  }));
}
