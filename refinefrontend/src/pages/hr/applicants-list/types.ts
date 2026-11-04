export interface ApplicantRow {
  name: string;
  applicant_name: string;
  email_id: string;
  phone_number: string;
  /** Job Opening link name, used by the position filter */
  jobName: string;
  /** Readable title of that opening */
  job_title: string;
  custom_recruiting_stage: string;
  source: string;
  creation: string;
  applicant_rating: number;
  custom_city: string;
  country: string;
}

export const STAGES = ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"] as const;
/** Stages that are finished; the default view hides them ("All active") */
export const FINISHED_STAGES: readonly string[] = ["Hired", "Rejected"];
export const RATINGS = ["1", "2", "3", "4", "5"] as const;
export const SORT_KEYS = ["applicant_name", "job_title", "custom_recruiting_stage", "source", "creation", "applicant_rating"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export interface Sort { key: SortKey; dir: 1 | -1 }

export function stageOf(a: ApplicantRow): string {
  return a.custom_recruiting_stage || "Applied";
}

export function compareRows(a: ApplicantRow, b: ApplicantRow, key: SortKey): number {
  if (key === "applicant_rating") return a.applicant_rating - b.applicant_rating;
  if (key === "custom_recruiting_stage") return stageOf(a).localeCompare(stageOf(b));
  const av = key === "applicant_name" ? a.applicant_name || a.name : a[key];
  const bv = key === "applicant_name" ? b.applicant_name || b.name : b[key];
  return (av ?? "").localeCompare(bv ?? "");
}
