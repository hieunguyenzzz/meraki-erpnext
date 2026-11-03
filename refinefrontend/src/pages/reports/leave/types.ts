export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const STATUSES = ["Active", "Left", "All"] as const;

export interface LeaveReportRow {
  employee: string;
  employee_name: string;
  date_of_joining: string;
  seniority_years: number;
  monthly_leave: number[];
  old_allocation_days: number;
  old_taken: number;
  old_balance: number;
  new_allocation_days: number;
  new_taken: number;
  new_balance: number;
  new_accrued: number;
  new_usable: number;
  total_balance: number;
}

export interface LeaveReportData {
  data: LeaveReportRow[];
  current_year: number;
  months: string[];
  employee_count: number;
}

export const balanceVariant = (n: number) => (n < 0 ? "destructive" : n > 0 ? "success" : "secondary");
export const dayLabel = (d: number) => (d % 1 === 0 ? String(d) : d.toFixed(1));
