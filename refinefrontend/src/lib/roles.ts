import type { LucideIcon } from "lucide-react";
import {
  Columns3,
  UserCheck, Calendar, ClipboardList, Banknote, Users,
  FileText, Receipt, CreditCard, BookOpen, PieChart,
} from "lucide-react";

export interface ModuleChild {
  label: string;
  path: string;
  icon?: LucideIcon;
}

export interface ModuleConfig {
  label: string;
  path: string;
  roles: string[];
  children: ModuleChild[];
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
      { label: "Kanban", path: "/crm", icon: Columns3 },
    ],
  },
  {
    label: "HR",
    path: "/hr",
    roles: HR_ROLES,
    children: [
      { label: "Recruiting", path: "/hr/recruiting", icon: Users },
      { label: "Employees", path: "/hr/employees", icon: UserCheck },
      { label: "Leave Management", path: "/hr/leaves", icon: Calendar },
      { label: "Payroll", path: "/hr/payroll", icon: Banknote },
      { label: "Onboarding", path: "/hr/onboarding", icon: ClipboardList },
    ],
  },
  {
    label: "Finance",
    path: "/finance",
    roles: FINANCE_ROLES,
    children: [
      { label: "Invoices", path: "/finance/invoices", icon: FileText },
      { label: "Expenses", path: "/finance/expenses", icon: Receipt },
      { label: "Payments", path: "/finance/payments", icon: CreditCard },
      { label: "Journal Entries", path: "/finance/journals", icon: BookOpen },
      { label: "Overview", path: "/finance/overview", icon: PieChart },
    ],
  },
];

const ALL_ADMIN_ROLES = [...new Set([...CRM_ROLES, ...HR_ROLES, ...FINANCE_ROLES])];

export function hasModuleAccess(userRoles: string[], moduleRoles: string[]): boolean {
  if (userRoles.includes("Administrator")) return true;
  return moduleRoles.some((role) => userRoles.includes(role));
}

export function isEmployeeSelfServiceOnly(roles: string[]): boolean {
  if (!roles.includes("Employee Self Service")) return false;
  if (roles.includes("Administrator")) return false;
  return !ALL_ADMIN_ROLES.some((r) => roles.includes(r));
}
