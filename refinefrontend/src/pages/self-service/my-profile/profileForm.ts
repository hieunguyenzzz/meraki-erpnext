import type { EmployeeProfile } from "@/lib/types";
import { REQUIRED_PROFILE_FIELDS } from "@/lib/profile";

export type FormData = {
  first_name: string;
  last_name: string;
  gender: string;
  date_of_birth: string;
  cell_number: string;
  personal_email: string;
  addr_street: string;
  addr_ward: string;
  addr_district: string;
  addr_province: string;
  permanent_address: string;
  person_to_be_contacted: string;
  relation: string;
  emergency_phone_number: string;
  bank_name: string;
  bank_ac_no: string;
};

export type SetField = (field: keyof FormData, value: string) => void;

export const INITIAL_FORM: FormData = {
  first_name: "",
  last_name: "",
  gender: "",
  date_of_birth: "",
  cell_number: "",
  personal_email: "",
  addr_street: "",
  addr_ward: "",
  addr_district: "",
  addr_province: "",
  permanent_address: "",
  person_to_be_contacted: "",
  relation: "",
  emergency_phone_number: "",
  bank_name: "",
  bank_ac_no: "",
};

export const REQUIRED_FIELDS = [
  ...REQUIRED_PROFILE_FIELDS,
  "addr_street",
  "addr_ward",
  "addr_district",
  "addr_province",
] as const;

export type SectionId = "personal" | "address" | "emergency" | "bank";

/** Required fields per section; together they equal REQUIRED_FIELDS. */
export const SECTIONS: { id: SectionId; title: string; required: readonly (keyof FormData)[] }[] = [
  { id: "personal", title: "Personal information", required: ["cell_number", "personal_email"] },
  { id: "address", title: "Current address", required: ["addr_street", "addr_ward", "addr_district", "addr_province"] },
  { id: "emergency", title: "Emergency contact", required: ["person_to_be_contacted", "emergency_phone_number"] },
  { id: "bank", title: "Bank details", required: ["bank_name", "bank_ac_no"] },
];

export function parseAddress(raw: string) {
  const parts = raw.split("||");
  return {
    addr_street: parts[0]?.trim() ?? "",
    addr_ward: parts[1]?.trim() ?? "",
    addr_district: parts[2]?.trim() ?? "",
    addr_province: parts[3]?.trim() ?? "",
  };
}

export function joinAddress(f: FormData) {
  return [f.addr_street, f.addr_ward, f.addr_district, f.addr_province].join("||");
}

export function formFromEmployee(employee: EmployeeProfile): FormData {
  return {
    first_name: employee.first_name ?? "",
    last_name: employee.last_name ?? "",
    gender: employee.gender ?? "",
    date_of_birth: employee.date_of_birth ?? "",
    cell_number: employee.cell_number ?? "",
    personal_email: employee.personal_email ?? "",
    ...parseAddress(employee.current_address ?? ""),
    permanent_address: employee.permanent_address ?? "",
    person_to_be_contacted: employee.person_to_be_contacted ?? "",
    relation: employee.relation ?? "",
    emergency_phone_number: employee.emergency_phone_number ?? "",
    bank_name: employee.bank_name ?? "",
    bank_ac_no: employee.bank_ac_no ?? "",
  };
}

/** Request body for PATCH /inquiry-api/me/profile (unchanged from the pre-redesign page). */
export function buildSavePayload(form: FormData) {
  const rest: Partial<FormData> = { ...form };
  delete rest.addr_street;
  delete rest.addr_ward;
  delete rest.addr_district;
  delete rest.addr_province;
  return { values: { ...rest, current_address: joinAddress(form) } };
}

export function sectionMissing(form: FormData, id: SectionId): number {
  const s = SECTIONS.find((x) => x.id === id)!;
  return s.required.filter((f) => !form[f]?.trim()).length;
}

export function isFormDirty(form: FormData, employee: EmployeeProfile): boolean {
  const saved = formFromEmployee(employee);
  return (Object.keys(saved) as (keyof FormData)[]).some((k) => saved[k] !== form[k]);
}
