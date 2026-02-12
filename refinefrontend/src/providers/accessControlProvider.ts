import type { AccessControlProvider } from "@refinedev/core";
import { CRM_ROLES, HR_ROLES, FINANCE_ROLES } from "@/lib/roles";

const RESOURCE_ROLE_MAP: Record<string, string[]> = {
  Customer: CRM_ROLES,
  "Sales Order": CRM_ROLES,
  Lead: CRM_ROLES,
  Opportunity: CRM_ROLES,
  Employee: HR_ROLES,
  "Leave Application": HR_ROLES,
  "Leave Allocation": HR_ROLES,
  "Sales Invoice": FINANCE_ROLES,
  "Payment Entry": FINANCE_ROLES,
  "Purchase Invoice": FINANCE_ROLES,
  "Journal Entry": FINANCE_ROLES,
};

export const accessControlProvider: AccessControlProvider = {
  can: async ({ resource, action, params }) => {
    const roles: string[] = params?.roles ?? [];

    // Administrators can do everything
    if (roles.includes("Administrator")) {
      return { can: true };
    }

    // If no resource specified, allow
    if (!resource) return { can: true };

    const requiredRoles = RESOURCE_ROLE_MAP[resource];
    if (!requiredRoles) return { can: true };

    const hasAccess = requiredRoles.some((role) => roles.includes(role));
    return { can: hasAccess };
  },
};
