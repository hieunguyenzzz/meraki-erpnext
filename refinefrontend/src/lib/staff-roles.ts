export const STAFF_ROLES = ["HR", "Planner", "Accounting", "Sales"] as const;
export type StaffRole = typeof STAFF_ROLES[number];

export type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info";

export function parseStaffRoles(rolesString?: string): StaffRole[] {
  if (!rolesString) return [];
  return rolesString.split(",").map(r => r.trim()).filter(Boolean) as StaffRole[];
}

export function serializeStaffRoles(roles: StaffRole[]): string {
  return roles.join(",");
}

export function getRoleBadgeVariant(role: StaffRole): BadgeVariant {
  switch (role) {
    case "HR": return "info";           // Blue
    case "Planner": return "success";   // Green
    case "Accounting": return "secondary"; // Gray/purple
    case "Sales": return "warning";     // Orange
  }
}
