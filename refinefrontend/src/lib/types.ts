export interface Employee {
  name: string;
  employee_name: string;
  first_name?: string;
  middle_name?: string;
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
  custom_lead_commission_pct?: number;
  custom_support_commission_pct?: number;
  custom_assistant_commission_pct?: number;
  custom_sales_commission_pct?: number;
  custom_insurance_salary?: number;
  custom_number_of_dependents?: number;
  relieving_date?: string;
  leave_approver?: string;
  custom_allowance_hcm_full?: number;
  custom_allowance_hcm_partial?: number;
  custom_allowance_dest_full?: number;
  custom_allowance_dest_partial?: number;
}

export interface VenueSupplier {
  name: string;
  supplier_name: string;
  supplier_group: string;
  custom_venue_city?: string;
  custom_location?: string;
  custom_capacity_min?: number;
  custom_capacity_max?: number;
  custom_price_range?: string;
  custom_features?: string;   // newline-separated
  custom_contact_person?: string;
  custom_notes?: string;
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
  cell_number?: string;
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
