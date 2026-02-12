export interface Employee {
  name: string;
  employee_name: string;
  first_name?: string;
  last_name?: string;
  designation: string;
  department: string;
  status: string;
  date_of_joining: string;
  date_of_birth?: string;
  gender?: string;
  cell_phone?: string;
  company_email?: string;
  user_id?: string;
  custom_meraki_id?: number;
  ctc?: number;
  custom_last_review_date?: string;
  custom_review_notes?: string;
  custom_staff_roles?: string;
  custom_lead_commission_pct?: number;
  custom_support_commission_pct?: number;
  custom_assistant_commission_pct?: number;
  custom_sales_commission_pct?: number;
  relieving_date?: string;
}

export interface EmployeeProfile {
  name: string;
  employee_name: string;
  first_name: string;
  middle_name?: string;
  last_name?: string;
  gender?: string;
  date_of_birth?: string;
  designation: string;
  department: string;
  status: string;
  date_of_joining: string;
  cell_phone?: string;
  personal_email?: string;
  current_address?: string;
  permanent_address?: string;
  person_to_be_contacted?: string;
  emergency_phone_number?: string;
  relation?: string;
  bank_name?: string;
  bank_ac_no?: string;
  iban?: string;
}
