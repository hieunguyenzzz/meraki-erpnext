import type { Employee } from "@/lib/types";
import type { EditSection } from "./types";

export type EditValues = Record<string, string | number>;

/** Initial form values per section (same fields the page has always saved). */
export function initialEditValues(employee: Employee, section: EditSection): EditValues {
  switch (section) {
    case "personal":
      return {
        first_name: employee.first_name || "",
        last_name: employee.last_name || "",
        gender: employee.gender || "",
        date_of_birth: employee.date_of_birth || "",
      };
    case "contact":
      return { company_email: employee.company_email || "" };
    case "commission":
      return {
        custom_lead_commission_pct: employee.custom_lead_commission_pct ?? 0,
        custom_support_commission_pct: employee.custom_support_commission_pct ?? 0,
        custom_assistant_commission_pct: employee.custom_assistant_commission_pct ?? 0,
        custom_full_package_commission_pct: employee.custom_full_package_commission_pct ?? 0,
        custom_partial_package_commission_pct: employee.custom_partial_package_commission_pct ?? 0,
      };
    case "allowance":
      return {
        custom_allowance_hcm_full: employee.custom_allowance_hcm_full ?? 0,
        custom_allowance_hcm_partial: employee.custom_allowance_hcm_partial ?? 0,
        custom_allowance_dest_full: employee.custom_allowance_dest_full ?? 0,
        custom_allowance_dest_partial: employee.custom_allowance_dest_partial ?? 0,
      };
    // Department is intentionally not editable here.
    case "employment":
      return {
        designation: employee.designation || "",
        date_of_joining: employee.date_of_joining || "",
        relieving_date: employee.relieving_date || "",
        ctc: employee.ctc ?? "",
        custom_insurance_salary: employee.custom_insurance_salary ?? "",
        custom_number_of_dependents: employee.custom_number_of_dependents ?? 0,
        leave_approver: employee.leave_approver || "",
        custom_is_probation: employee.custom_is_probation ?? 0,
        custom_pit_method: employee.custom_pit_method ?? "",
        custom_probation_end_date: employee.custom_probation_end_date ?? "",
      };
  }
}

const NUMERIC_FIELDS = [
  "ctc", "custom_insurance_salary", "custom_number_of_dependents",
  "custom_allowance_hcm_full", "custom_allowance_hcm_partial",
  "custom_allowance_dest_full", "custom_allowance_dest_partial",
  "custom_lead_commission_pct", "custom_support_commission_pct",
  "custom_assistant_commission_pct",
  "custom_full_package_commission_pct", "custom_partial_package_commission_pct",
];

/** Payload sent to PATCH /inquiry-api/employee/{name}: numeric fields converted, empty string -> 0. */
export function toPayload(editValues: EditValues): EditValues {
  const values = { ...editValues };
  for (const field of NUMERIC_FIELDS) {
    if (field in values) values[field] = values[field] === "" ? 0 : Number(values[field]);
  }
  return values;
}
