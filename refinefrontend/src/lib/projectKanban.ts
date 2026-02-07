export type ProjectColumnKey = "onboarding" | "planning" | "final_details" | "wedding_week" | "day_of" | "completed";

export interface ProjectKanbanItem {
  id: string;                    // Project name
  project_name: string;
  status: string;
  custom_project_stage: string;
  customer?: string;
  customer_name?: string;
  expected_end_date?: string;   // Wedding date
  sales_order?: string;
  // Custom fields from linked data
  venue_name?: string;
}

export interface ProjectColumnDef {
  key: ProjectColumnKey;
  label: string;
  color: string;
  stages: string[];
  collapsible?: boolean;
  collapsedByDefault?: boolean;
}

export const PROJECT_COLUMNS: ProjectColumnDef[] = [
  { key: "onboarding", label: "Onboarding", color: "blue", stages: ["Onboarding"] },
  { key: "planning", label: "Planning", color: "amber", stages: ["Planning"] },
  { key: "final_details", label: "Final Details", color: "cyan", stages: ["Final Details"] },
  { key: "wedding_week", label: "Wedding Week", color: "rose", stages: ["Wedding Week"] },
  { key: "day_of", label: "Day-of", color: "purple", stages: ["Day-of"] },
  { key: "completed", label: "Completed", color: "green", stages: ["Completed"], collapsible: true, collapsedByDefault: true },
];

export function getProjectColumnKey(item: ProjectKanbanItem): ProjectColumnKey {
  for (const col of PROJECT_COLUMNS) {
    if (col.stages.includes(item.custom_project_stage)) return col.key;
  }
  return "onboarding"; // default
}

export function formatDaysUntilWedding(weddingDate: string): { text: string; color: string } {
  const days = Math.ceil((new Date(weddingDate).getTime() - Date.now()) / 86400000);
  if (days < 0) return { text: "Past", color: "muted" };
  if (days === 0) return { text: "Today!", color: "rose" };
  if (days <= 7) return { text: `${days}d`, color: "rose" };
  if (days <= 30) return { text: `${days}d`, color: "amber" };
  return { text: `${days}d`, color: "cyan" };
}
