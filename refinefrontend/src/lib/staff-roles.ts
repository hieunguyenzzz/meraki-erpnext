export const STAFF_ROLES = ["HR", "Planner", "Accounting", "Sales"] as const;
export type StaffRole = typeof STAFF_ROLES[number];

export type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info";

/**
 * Mapping of Staff Roles to ERPNext User Roles.
 * When a staff role is assigned, these ERPNext roles are added to the User.
 */
export const STAFF_ROLE_TO_ERPNEXT_ROLES: Record<StaffRole, string[]> = {
  Sales: ["Sales User", "Inbox User", "Super Email User"],
  HR: ["HR User"],
  Accounting: ["Accounts User"],
  Planner: ["Projects User"],
};

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

/**
 * Get all ERPNext roles that should be assigned based on staff roles.
 */
export function getRequiredErpnextRoles(staffRoles: StaffRole[]): string[] {
  const roles = new Set<string>(["Employee"]); // All staff get Employee role
  for (const staffRole of staffRoles) {
    const erpnextRoles = STAFF_ROLE_TO_ERPNEXT_ROLES[staffRole];
    if (erpnextRoles) {
      erpnextRoles.forEach(r => roles.add(r));
    }
  }
  return Array.from(roles);
}

/**
 * Get all ERPNext roles that are managed by staff role assignments.
 * These roles may be added or removed based on staff roles.
 */
export function getAllManagedRoles(): Set<string> {
  const managed = new Set<string>();
  for (const roles of Object.values(STAFF_ROLE_TO_ERPNEXT_ROLES)) {
    roles.forEach(r => managed.add(r));
  }
  return managed;
}

/**
 * Sync ERPNext User roles based on assigned staff roles.
 * Adds required roles and removes roles that are no longer needed.
 */
export async function syncUserRoles(userId: string, staffRoles: StaffRole[]): Promise<void> {
  if (!userId) return;

  const requiredRoles = new Set(getRequiredErpnextRoles(staffRoles));
  const managedRoles = getAllManagedRoles();

  // Get current user roles
  const userRes = await fetch(`/api/resource/User/${encodeURIComponent(userId)}`, {
    credentials: "include",
    headers: { "X-Frappe-Site-Name": "erp.merakiwp.com" },
  });

  if (!userRes.ok) {
    console.error("Failed to fetch user:", userId);
    return;
  }

  const userData = await userRes.json();
  const currentRoles = (userData.data.roles || []) as { role: string }[];

  // Build new roles list:
  // - Keep roles that are NOT managed by staff roles (manually assigned)
  // - Keep managed roles that are still required
  // - Add new required roles
  const newRoles: { role: string }[] = [];
  const addedRoles = new Set<string>();

  for (const r of currentRoles) {
    const isManaged = managedRoles.has(r.role);
    const isRequired = requiredRoles.has(r.role);

    if (!isManaged || isRequired) {
      // Keep: either not managed by us, or still required
      newRoles.push(r);
      addedRoles.add(r.role);
    }
    // Skip: managed role that's no longer required (will be removed)
  }

  // Add any required roles not already present
  for (const role of requiredRoles) {
    if (!addedRoles.has(role)) {
      newRoles.push({ role });
    }
  }

  // Update user roles
  await fetch(`/api/resource/User/${encodeURIComponent(userId)}`, {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Frappe-Site-Name": "erp.merakiwp.com",
    },
    body: JSON.stringify({ roles: newRoles }),
  });
}
