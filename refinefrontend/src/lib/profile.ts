export const REQUIRED_PROFILE_FIELDS = [
  "cell_number",
  "personal_email",
  "person_to_be_contacted",
  "emergency_phone_number",
  "bank_name",
  "bank_ac_no",
] as const;

export function isProfileIncomplete(employee: Record<string, any>): boolean {
  for (const f of REQUIRED_PROFILE_FIELDS) {
    if (!employee[f]?.trim()) return true;
  }
  // Address stored as "street||ward||district||province"
  const addr = employee.current_address ?? "";
  const parts = addr.split("||");
  if (parts.length < 4 || parts.some((p: string) => !p.trim())) return true;
  return false;
}
