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
  custom_full_package_commission_pct?: number;
  custom_partial_package_commission_pct?: number;
  custom_insurance_salary?: number;
  custom_number_of_dependents?: number;
  relieving_date?: string;
  leave_approver?: string;
  custom_allowance_hcm_full?: number;
  custom_allowance_hcm_partial?: number;
  custom_allowance_dest_full?: number;
  custom_allowance_dest_partial?: number;
  custom_is_probation?: number;
  custom_probation_end_date?: string;
}

export interface VenueSupplier {
  name: string;
  supplier_name: string;
  supplier_group: string;
  disabled?: 0 | 1;
  custom_venue_city?: string;
  custom_location?: string;
  custom_capacity_min?: number;
  custom_capacity_max?: number;
  custom_price_range?: string;
  custom_features?: string;   // newline-separated
  custom_contact_person?: string;
  custom_notes?: string;
  custom_venue_external_key?: string;
  custom_venue_location_subarea?: string;
  custom_venue_type?: string;
  custom_venue_price_range?: "" | "LOW" | "MID" | "HIGH" | "LUXURY" | "UNKNOWN";
  custom_venue_wedding_package_text?: string;
  custom_venue_wedding_package_url?: string;
  custom_venue_insights?: string;
  custom_venue_accommodation?: string;
  custom_venue_fnb?: string;
  custom_venue_av_policy?: string;
  custom_venue_facility?: string;
  custom_venue_after_party?: string;
  custom_venue_contact_raw?: string;
  custom_venue_source?: string;
  custom_cover_photo?: string;
  custom_venue_wedding_areas?: VenueWeddingArea[];
}

export interface VenueWeddingArea {
  name: string;
  area_name: string;
  area_type?: "Ballroom/Indoor" | "Lawn" | "Beach" | "Restaurant/Café/Bar" | "Pool" | "Other";
  function?: string;
  capacity_min?: number;
  capacity_max?: number;
  capacity_notes?: string;
  policy_min_spend?: string;
  setup_notes?: string;
  meraki_weddings?: string;
  photos_url?: string;
  idx?: number;
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
