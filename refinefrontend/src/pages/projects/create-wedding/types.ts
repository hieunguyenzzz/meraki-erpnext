export interface AddOnRow {
  /** Stable key for the row (not sent to the backend). */
  id: number;
  itemCode: string;
  itemName: string;
  price: string;
  includeInCommission: boolean;
}

export interface AddOnItem {
  name: string;
  item_name: string;
  custom_include_in_commission: 0 | 1;
}

export interface EmployeeOption {
  name: string;
  employee_name: string;
  first_name?: string;
  last_name?: string;
}

export interface FormData {
  // Couple
  coupleName: string;
  email: string;
  phone: string;
  extraEmails: string[];
  // Wedding
  weddingDate: string;
  weddingType: "HCM" | "Destination" | "";
  guestCount: string;
  // Venue (Supplier document name)
  venue: string;
  // Price & tax
  packageAmount: string;
  taxType: "tax_free" | "vat_included";
  // Add-ons
  addOns: AddOnRow[];
  // Team
  leadPlanner: string;
  supportPlanner: string;
  assistants: string[];
}

export const initialFormData: FormData = {
  coupleName: "",
  email: "",
  phone: "",
  extraEmails: [],
  weddingDate: "",
  weddingType: "",
  guestCount: "",
  venue: "",
  packageAmount: "",
  taxType: "tax_free",
  addOns: [],
  leadPlanner: "",
  supportPlanner: "",
  assistants: [],
};

export const MAX_ASSISTANTS = 5;

/** Joins a FastAPI `detail` (string or validation list) into one readable message. */
export function apiErrorMessage(err: { detail?: unknown }, fallback: string): string {
  const detail = err.detail;
  if (Array.isArray(detail)) {
    return detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join(", ");
  }
  return typeof detail === "string" && detail ? detail : fallback;
}
