export interface JobOpening {
  name: string;
  job_title: string;
  status: string;
  /** Link to Branch (not Location) */
  location: string;
  closes_on: string;
  designation: string;
  description: string;
}

export const SORT_KEYS = ["job_title", "status", "location", "closes_on"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export interface Sort { key: SortKey; dir: 1 | -1 }

export interface PositionForm {
  designation: string;
  location: string;
  closes_on: string;
  description: string;
}

export const INITIAL_FORM: PositionForm = { designation: "", location: "", closes_on: "", description: "" };

export function statusOf(j: JobOpening): string {
  return j.status || "Open";
}
