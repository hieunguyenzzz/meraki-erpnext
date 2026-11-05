export type EditSection = "personal" | "contact" | "employment" | "commission" | "allowance";

export interface LeaveAllocation {
  name: string;
  leave_type: string;
  allocated: number;
  taken: number;
  balance: number;
  usable?: number;
}

export interface LeavePeriod {
  label: string;
  from_date: string;
  to_date: string;
  is_current: boolean;
  allocations: LeaveAllocation[];
}

export interface LeaveBalance {
  allocated: number;
  accrued: number;
  taken: number;
  remaining: number;
}

export interface UserOption {
  name: string;
  full_name?: string;
  email?: string;
}

export interface EmployeeRecord {
  id: string;
  type: "leave" | "wfh";
  from_date: string;
  to_date: string;
  days: number;
  details: string;
  status: string;
  isPending: boolean;
}

export interface ReviewRow {
  name: string;
  review_date: string;
  review_time?: string;
  notes?: string;
  participants?: string;
  google_event_id?: string;
}
