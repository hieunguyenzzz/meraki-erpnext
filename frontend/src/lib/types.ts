export interface Customer {
  name: string;
  customer_name: string;
  customer_type: string;
  customer_group: string;
  territory: string;
  mobile_no?: string;
  email_id?: string;
  custom_meraki_customer_id?: number;
}

export interface SalesOrder {
  name: string;
  customer: string;
  customer_name: string;
  transaction_date: string;
  delivery_date: string;
  grand_total: number;
  status: string;
  per_delivered: number;
  per_billed: number;
  project?: string;
  custom_wedding_date?: string;
  custom_venue?: string;
  items?: SalesOrderItem[];
}

export interface SalesOrderItem {
  item_code: string;
  item_name: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface Employee {
  name: string;
  employee_name: string;
  designation: string;
  department: string;
  status: string;
  date_of_joining: string;
  date_of_birth?: string;
  cell_phone?: string;
  company_email?: string;
  custom_meraki_id?: number;
  ctc?: number;
}

export interface SalesInvoice {
  name: string;
  customer: string;
  customer_name: string;
  posting_date: string;
  grand_total: number;
  outstanding_amount: number;
  status: string;
  sales_order?: string;
}

export interface JournalEntry {
  name: string;
  posting_date: string;
  voucher_type: string;
  total_debit: number;
  total_credit: number;
  user_remark?: string;
  docstatus: number;
}

export interface Project {
  name: string;
  project_name: string;
  status: string;
  sales_order?: string;
  expected_start_date?: string;
  expected_end_date?: string;
}

export interface Lead {
  name: string;
  lead_name: string;
  email_id?: string;
  phone?: string;
  source?: string;
  status: string;
  company_name?: string;
  creation: string;
}

export interface Opportunity {
  name: string;
  party_name: string;
  opportunity_from?: string;
  opportunity_type?: string;
  status: string;
  expected_closing?: string;
  opportunity_amount?: number;
  source?: string;
  creation: string;
}

export interface LeaveApplication {
  name: string;
  employee: string;
  employee_name: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  total_leave_days: number;
  status: string;
  docstatus: number;
}

export interface LeaveAllocation {
  name: string;
  employee: string;
  employee_name: string;
  leave_type: string;
  new_leaves_allocated: number;
  from_date: string;
  to_date: string;
}

export interface EmployeeOnboarding {
  name: string;
  employee: string;
  employee_name: string;
  boarding_status: string;
  department?: string;
  designation?: string;
  date_of_joining?: string;
  activities?: OnboardingActivity[];
}

export interface OnboardingActivity {
  activity_name: string;
  user: string;
  role?: string;
  required_for_employee_creation?: number;
  description?: string;
  completed?: number;
}
