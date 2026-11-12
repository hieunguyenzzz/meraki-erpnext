export interface StaffRow {
  name: string;
  employee_name: string;
  first_name?: string;
  last_name?: string;
  designation: string;
  department: string;
  date_of_joining: string;
  custom_last_review_date?: string;
  custom_review_notes?: string;
  custom_display_order?: number;
  user_id?: string;
  staff_roles: string[];
  is_probation: boolean;
  leave_allocated: number;
  leave_taken: number;
  leave_remaining: number;
}

export interface StaffSummary {
  total: number;
  overdue: number;
  due_soon: number;
  up_to_date: number;
}

export interface StaffOverviewData {
  data: Array<Omit<StaffRow, "staff_roles" | "is_probation"> & {
    display_name: string;
    custom_meraki_id?: number;
    is_probation?: boolean;
  }>;
  summary: StaffSummary;
}
