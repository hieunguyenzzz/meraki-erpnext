export interface ModuleConfig {
  label: string;
  path: string;
  roles: string[];
  children: { label: string; path: string }[];
}

export const CRM_ROLES = ["System Manager", "Sales Manager", "Sales User"];
export const HR_ROLES = ["System Manager", "HR Manager", "HR User"];
export const FINANCE_ROLES = ["System Manager", "Accounts Manager", "Accounts User"];

export const MODULES: ModuleConfig[] = [
  {
    label: "CRM",
    path: "/crm",
    roles: CRM_ROLES,
    children: [
      { label: "Customers", path: "/crm/customers" },
      { label: "Weddings", path: "/crm/weddings" },
      { label: "Leads", path: "/crm/leads" },
      { label: "Opportunities", path: "/crm/opportunities" },
    ],
  },
  {
    label: "HR",
    path: "/hr",
    roles: HR_ROLES,
    children: [
      { label: "Employees", path: "/hr/employees" },
      { label: "Leave Management", path: "/hr/leaves" },
      { label: "Onboarding", path: "/hr/onboarding" },
    ],
  },
  {
    label: "Finance",
    path: "/finance",
    roles: FINANCE_ROLES,
    children: [
      { label: "Invoices", path: "/finance/invoices" },
      { label: "Journal Entries", path: "/finance/journals" },
      { label: "Overview", path: "/finance/overview" },
    ],
  },
];

export function hasModuleAccess(userRoles: string[], moduleRoles: string[]): boolean {
  if (userRoles.includes("Administrator")) return true;
  return moduleRoles.some((role) => userRoles.includes(role));
}
