import type { LucideIcon } from "lucide-react";
import {
  Columns3, MessageSquare,
  Banknote, Users, LayoutDashboard,
  FileText, Receipt, CreditCard, BookOpen,
  FolderKanban, Settings, MapPin, CalendarDays,
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
export const PLANNER_ROLES = [...CRM_ROLES, "Projects User"];
export const HR_ROLES = ["System Manager", "HR Manager", "HR User"];
export const FINANCE_ROLES = ["System Manager", "Accounts Manager", "Accounts User"];
export const DIRECTOR_ROLES = ["System Manager"];

export type DashboardOption = "personal" | "director";

/** Returns which dashboard views a user is eligible for, in priority order. */
export function getDashboardOptions(roles: string[]): DashboardOption[] {
  const options: DashboardOption[] = ["personal"]; // always available
  if (hasModuleAccess(roles, DIRECTOR_ROLES)) {
    options.unshift("director"); // director first = default
  }
  return options;
}

export const MODULES: ModuleConfig[] = [
  {
    label: "CRM",
    path: "/crm",
    roles: CRM_ROLES,
    children: [
      { label: "Kanban", path: "/crm", icon: Columns3 },
      { label: "Chats", path: "/crm/chats", icon: MessageSquare },
    ],
  },
  {
    label: "Weddings",
    path: "/projects",
    roles: PLANNER_ROLES,
    children: [
      { label: "Kanban", path: "/projects", icon: FolderKanban },
      { label: "Venues", path: "/venues",   icon: MapPin },
    ],
  },
  {
    label: "HR",
    path: "/hr",
    roles: HR_ROLES,
    children: [
      { label: "Staff Overview", path: "/hr/staff-overview", icon: LayoutDashboard },
      { label: "Recruiting", path: "/hr/recruiting", icon: Users },
      { label: "Payroll", path: "/hr/payroll", icon: Banknote },
      { label: "Leave Report", path: "/hr/leaves", icon: CalendarDays },
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
    ],
  },
  {
    label: "Settings",
    path: "/admin",
    roles: ["System Manager", "Administrator"],
    children: [
      { label: "Settings", path: "/admin/settings", icon: Settings },
    ],
  },
];

const ALL_ADMIN_ROLES = [...new Set([...CRM_ROLES, ...PLANNER_ROLES, ...HR_ROLES, ...FINANCE_ROLES])];

export function hasModuleAccess(userRoles: string[], moduleRoles: string[]): boolean {
  if (userRoles.includes("Administrator")) return true;
  return moduleRoles.some((role) => userRoles.includes(role));
}

export function isEmployeeSelfServiceOnly(roles: string[]): boolean {
  if (!roles.includes("Employee Self Service")) return false;
  if (roles.includes("Administrator")) return false;
  return !ALL_ADMIN_ROLES.some((r) => roles.includes(r));
}

export const ASSIGNABLE_ROLES = [
  { role: "System Manager",   label: "Admin",         variant: "destructive" },
  { role: "Sales Manager",    label: "Sales Manager", variant: "warning" },
  { role: "Sales User",       label: "Sales",         variant: "warning" },
  { role: "HR Manager",       label: "HR Manager",    variant: "info" },
  { role: "HR User",          label: "HR",            variant: "info" },
  { role: "Accounts Manager", label: "Finance Mgr",   variant: "secondary" },
  { role: "Accounts User",    label: "Finance",       variant: "secondary" },
  { role: "Projects User",    label: "Planner",       variant: "success" },
  { role: "Inbox User",       label: "Inbox",         variant: "default" },
] as const;

export type AssignableRole = typeof ASSIGNABLE_ROLES[number]["role"];
