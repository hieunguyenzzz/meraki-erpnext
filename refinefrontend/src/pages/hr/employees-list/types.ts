export interface Employee {
  name: string;
  employee_name: string;
  first_name?: string;
  last_name?: string;
  designation?: string;
  department?: string;
  status: string;
  relieving_date?: string;
  custom_last_review_date?: string;
  custom_is_probation?: number;
}

export const STATUSES = ["Active", "Inactive", "Suspended", "Left"] as const;

export const SORT_KEYS = ["employee_name", "designation", "department", "status", "custom_last_review_date"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
