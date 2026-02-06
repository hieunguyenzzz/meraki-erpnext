export type ColumnKey = "new" | "engaged" | "meeting" | "quoted" | "won" | "lost";

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
  meetingDate?: string; // ISO datetime of scheduled meeting (from ERPNext Event)
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
  /** Can this column be collapsed? */
  collapsible?: boolean;
  /** Start collapsed by default? */
  collapsedByDefault?: boolean;
}

// Simplified Lead-only CRM: All stages use Lead doctype (no Opportunity conversion)
export const COLUMNS: ColumnDef[] = [
  {
    key: "new",
    label: "New",
    color: "blue",
    leadStatuses: ["Lead", "Open"],
    oppStatuses: [],
    leadTarget: "Open",
    oppTarget: "",
  },
  {
    key: "engaged",
    label: "Engaged",
    color: "amber",
    leadStatuses: ["Replied"],
    oppStatuses: [],
    leadTarget: "Replied",
    oppTarget: "",
  },
  {
    key: "meeting",
    label: "Meeting",
    color: "cyan",
    leadStatuses: ["Interested"],
    oppStatuses: [],
    leadTarget: "Interested",
    oppTarget: "",
  },
  {
    key: "quoted",
    label: "Quoted",
    color: "indigo",
    leadStatuses: ["Quotation"],
    oppStatuses: ["Open", "Quotation"],  // Keep oppStatuses for existing Opportunities
    leadTarget: "Quotation",
    oppTarget: "Quotation",
  },
  {
    key: "won",
    label: "Won",
    color: "green",
    leadStatuses: ["Converted"],
    oppStatuses: ["Converted"],  // Keep oppStatuses for existing Opportunities
    leadTarget: "Converted",
    oppTarget: "Converted",
    collapsible: true,
    collapsedByDefault: true,
  },
  {
    key: "lost",
    label: "Lost",
    color: "rose",
    leadStatuses: ["Do Not Contact", "Lost Quotation"],
    oppStatuses: ["Lost", "Closed"],  // Keep oppStatuses for existing Opportunities
    leadTarget: "Do Not Contact",
    oppTarget: "Lost",
    collapsible: true,
    collapsedByDefault: true,
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

/** Lead statuses that should be hidden from Kanban (none - all Leads are now shown) */
const HIDDEN_LEAD_STATUSES = new Set<string>();

export function buildKanbanItems(
  leads: any[],
  opportunities: any[],
): KanbanItem[] {
  // Build set of Lead names that already have an Opportunity (party_name references the Lead)
  const leadsWithOpportunity = new Set(
    opportunities.map((o) => o.party_name).filter(Boolean),
  );

  // Lookup from Lead name → lead record for fallback contact info on Opportunities
  const leadsByName = new Map(leads.map((l) => [l.name, l]));

  const items: KanbanItem[] = [];
  for (const l of leads) {
    if (leadsWithOpportunity.has(l.name) || HIDDEN_LEAD_STATUSES.has(l.status)) continue;
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
    const sourceLead = leadsByName.get(o.party_name);
    items.push({
      id: `Opportunity::${o.name}`,
      doctype: "Opportunity",
      displayName: o.customer_name || o.party_name || o.name,
      status: o.status,
      email: o.contact_email || sourceLead?.email_id,
      phone: o.contact_mobile || sourceLead?.phone,
      creation: o.creation,
    });
  }
  return items;
}

/** Statuses where items should not be moved (existing Opportunities only) */
const LOCKED_OPP_STATUSES = new Set(["Converted", "Lost", "Closed"]);

export function isItemLocked(item: KanbanItem): boolean {
  // Leads can move through all stages (simplified Lead-only CRM)
  if (item.doctype === "Lead") return false;
  // Lock existing Opportunities in terminal states
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
      // communication_date and creation are both stored in server local time
      const dateStr = (c.communication_date || c.creation).replace(" ", "T");
      latestByRef.set(key, {
        date: dateStr,
        waitingFor: c.sent_or_received === "Sent" ? "client" : "staff",
      });
    }
  }
  return items.map(item => ({
    ...item,
    lastActivity: latestByRef.get(item.id),
  }));
}

/** Merge meeting dates from Events into kanban items (for Leads) */
export function enrichWithMeetings(
  items: KanbanItem[],
  events: { reference_docname: string; starts_on: string }[],
): KanbanItem[] {
  // Map from Lead name to earliest upcoming meeting date
  const meetingMap = new Map<string, string>();
  for (const e of events) {
    const existing = meetingMap.get(e.reference_docname);
    if (!existing || e.starts_on < existing) {
      meetingMap.set(e.reference_docname, e.starts_on);
    }
  }
  return items.map(item => ({
    ...item,
    meetingDate: item.doctype === "Lead" ? meetingMap.get(getDocName(item)) : undefined,
  }));
}

/** Format meeting date for display on cards: "15 Feb, 10:30" */
export function formatMeetingDate(datetime: string): string {
  const d = new Date(datetime);
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}
