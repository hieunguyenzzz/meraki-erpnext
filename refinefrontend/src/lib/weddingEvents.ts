// Shared types + constants for the Wedding Events feature (cross-wedding table +
// per-project Events tab). Backed by /inquiry-api/wedding-events.

export interface EventStaffRow {
  employee: string;
  employee_name?: string;
  role?: string;
  call_time?: string | null;
  notes?: string;
}

export interface WeddingEvent {
  name: string;
  project: string;
  project_name?: string;
  customer?: string;
  wedding_type?: string;
  event_type: string;
  event_date: string;
  start_time?: string | null;
  end_time?: string | null;
  venue?: string;
  venue_name?: string;
  venue_area?: string;
  guest_count?: number;
  notes?: string;
  staff: EventStaffRow[];
}

export interface StaffEventCount {
  employee: string;
  employee_name: string;
  event_count: number;
}

export interface WeddingEventsResponse {
  events: WeddingEvent[];
  staff_counts: StaffEventCount[];
}

export const EVENT_TYPES = [
  "Tea Ceremony",
  "Pre-wedding Photoshoot",
  "Welcome Dinner",
  "Ceremony",
  "Buddhist Wedding",
  "Reception",
  "After Party",
  "Farewell Brunch",
  "Other",
] as const;

export const STAFF_ROLES = [
  "Lead Planner",
  "Support Planner",
  "Coordinator",
  "Assistant",
  "Photographer Liaison",
  "Other",
] as const;

/** Badge only ships 7 variants but we have 9 event types — map each to a Tailwind pair, same grammar as KanbanColumn's colorMap. */
export const EVENT_TYPE_COLOR: Record<string, string> = {
  "Tea Ceremony": "bg-blue-50 text-blue-700 border-blue-200/60 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800/60",
  "Pre-wedding Photoshoot": "bg-purple-50 text-purple-700 border-purple-200/60 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800/60",
  "Welcome Dinner": "bg-amber-50 text-amber-700 border-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/60",
  Ceremony: "bg-rose-50 text-rose-700 border-rose-200/60 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800/60",
  "Buddhist Wedding": "bg-orange-50 text-orange-700 border-orange-200/60 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800/60",
  Reception: "bg-green-50 text-green-700 border-green-200/60 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800/60",
  "After Party": "bg-indigo-50 text-indigo-700 border-indigo-200/60 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800/60",
  "Farewell Brunch": "bg-cyan-50 text-cyan-700 border-cyan-200/60 dark:bg-cyan-950/30 dark:text-cyan-400 dark:border-cyan-800/60",
  Other: "bg-slate-50 text-slate-700 border-slate-200/60 dark:bg-slate-900/30 dark:text-slate-400 dark:border-slate-800/60",
};

/** "18:00:00" -> "18:00". Backend always sends HH:MM:SS or null. */
function trimSeconds(t: string): string {
  return t.slice(0, 5);
}

export function formatTimeRange(start?: string | null, end?: string | null): string {
  if (start && end) return `${trimSeconds(start)}–${trimSeconds(end)}`;
  if (start) return trimSeconds(start);
  if (end) return trimSeconds(end);
  return "";
}
