import type { LucideIcon } from "lucide-react";
import {
  Home, Bell, Columns3, MessageSquare, Heart, CalendarDays, MapPin, Store,
  Users, Filter, ClipboardCheck, House, Banknote, Star, FileText, Receipt,
  CreditCard, BookOpen, LineChart, FileBarChart, User, Settings, Wallet,
  Briefcase, FileSignature,
} from "lucide-react";
import {
  CRM_ROLES, PLANNER_ROLES, HR_ROLES, FINANCE_ROLES, REPORT_ROLES,
  DIRECTOR_ROLES, SETTINGS_ROLES, hasModuleAccess, isEmployeeSelfServiceOnly,
} from "@/lib/roles";

export type BadgeKey = "notifications";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  /** Roles that may see the item. Omitted = every user who can reach the admin shell. */
  roles?: string[];
  /** Extra path prefixes that keep this item highlighted (detail pages). */
  also?: string[];
  badge?: BadgeKey;
}

export interface NavGroup {
  title: string | null;
  /** Heading used on the mobile More page when `title` reads badly there. */
  moreTitle?: string;
  items: NavItem[];
}

/** Desktop sidebar, in the order of the redesign (Sidebar.dc.html). */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: null,
    items: [
      { label: "Home", path: "/", icon: Home },
      { label: "Notifications", path: "/notifications", icon: Bell, badge: "notifications" },
    ],
  },
  {
    title: "CRM",
    items: [
      { label: "Lead pipeline", path: "/crm", icon: Columns3, roles: CRM_ROLES },
      { label: "Chats", path: "/crm/chats", icon: MessageSquare, roles: CRM_ROLES },
    ],
  },
  {
    title: "Weddings",
    items: [
      // Finance can open weddings from the bottom bar (Main.dc.html), so it sees this one item.
      { label: "All weddings", path: "/projects", icon: Heart, roles: [...PLANNER_ROLES, ...FINANCE_ROLES] },
      { label: "Events", path: "/projects/events", icon: CalendarDays, roles: PLANNER_ROLES },
      { label: "Venues", path: "/venues", icon: MapPin, roles: PLANNER_ROLES },
      { label: "Vendors", path: "/vendors", icon: Store, roles: PLANNER_ROLES },
    ],
  },
  {
    title: "People",
    items: [
      { label: "Staff", path: "/hr/staff-overview", icon: Users, roles: HR_ROLES, also: ["/hr/employees"] },
      { label: "Recruiting", path: "/hr/recruiting/pipeline", icon: Filter, roles: HR_ROLES, also: ["/hr/recruiting"] },
      { label: "Leaves", path: "/hr/leaves", icon: ClipboardCheck, roles: HR_ROLES },
      { label: "Work from home", path: "/hr/wfh", icon: House, roles: HR_ROLES },
      { label: "Payroll", path: "/hr/payroll", icon: Banknote, roles: HR_ROLES },
      { label: "Reviews", path: "/hr/staff-reviews", icon: Star, roles: HR_ROLES },
    ],
  },
  {
    title: "Finance",
    items: [
      { label: "Invoices", path: "/finance/invoices", icon: FileText, roles: FINANCE_ROLES },
      { label: "Expenses", path: "/finance/expenses", icon: Receipt, roles: FINANCE_ROLES },
      { label: "Payments", path: "/finance/payments", icon: CreditCard, roles: FINANCE_ROLES },
      { label: "Journal entries", path: "/finance/journals", icon: BookOpen, roles: FINANCE_ROLES },
      { label: "Revenue", path: "/finance/overview", icon: LineChart, roles: FINANCE_ROLES },
    ],
  },
  {
    title: "More",
    moreTitle: "Tools",
    items: [
      { label: "Reports", path: "/reports/leaves", icon: FileBarChart, roles: REPORT_ROLES, also: ["/reports"] },
      { label: "Me", path: "/my-profile", icon: User },
      { label: "Settings", path: "/admin/settings", icon: Settings, roles: SETTINGS_ROLES },
    ],
  },
];

/** Employee-only staff sidebar: Home, Notifications, My Weddings, Requests, Me (Sidebar.dc.html). */
const STAFF_SIDEBAR: NavItem[] = [
  { label: "Home", path: "/", icon: Home },
  { label: "Notifications", path: "/notifications", icon: Bell, badge: "notifications" },
  { label: "My weddings", path: "/my-weddings", icon: Heart },
  { label: "Requests", path: "/my-leaves", icon: FileSignature },
  { label: "Me", path: "/my-profile", icon: User },
];

/** Self-service destinations (open to every signed-in user). */
export const SELF_SERVICE_ITEMS: NavItem[] = [
  { label: "Me", path: "/my-profile", icon: User },
  { label: "Requests", path: "/my-leaves", icon: FileSignature },
  { label: "My WFH", path: "/my-attendance", icon: House },
  { label: "Payslips", path: "/my-payroll", icon: Wallet },
];

/** Reachable only through the command palette (not in the sidebar design). */
const ADD_EXPENSE: NavItem = { label: "Add expense", path: "/finance/expenses/new", icon: Wallet };
const PALETTE_EXTRAS: NavItem[] = [
  { label: "Job openings", path: "/hr/recruiting/jobs", icon: Briefcase, roles: HR_ROLES },
  { label: "Expense report", path: "/reports/expenses", icon: Receipt, roles: REPORT_ROLES },
  ADD_EXPENSE,
];

function allowed(item: NavItem, roles: string[]) {
  return !item.roles || hasModuleAccess(roles, item.roles);
}

/** Sidebar groups the user may see. Employee-only users get their own short list. */
export function getVisibleNavGroups(roles: string[]): NavGroup[] {
  if (isEmployeeSelfServiceOnly(roles)) {
    return [{ title: null, items: STAFF_SIDEBAR }];
  }
  return NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => allowed(i, roles)) }))
    .filter((g) => g.items.length > 0);
}

/** Longest matching prefix wins, so /crm/chats highlights Chats but /crm/leads/x highlights Lead pipeline. */
export function matchLength(pathname: string, path: string, also: string[] = []): number {
  if (path === "/") return pathname === "/" ? 1 : 0;
  return [path, ...also].reduce((best, p) => {
    const hit = pathname === p || pathname.startsWith(p + "/");
    return hit ? Math.max(best, p.length) : best;
  }, 0);
}

export function getActiveItem(pathname: string, items: NavItem[]): NavItem | undefined {
  let best: NavItem | undefined;
  let bestLen = 0;
  for (const item of items) {
    const len = matchLength(pathname, item.path, item.also);
    if (len > bestLen) {
      best = item;
      bestLen = len;
    }
  }
  return best;
}

export type PrimaryRole = "director" | "sales" | "hr" | "finance" | "staff";

/** First match in the order Director/admin, Sales/planner, HR, Finance (Main.dc.html). */
export function getPrimaryRole(roles: string[]): PrimaryRole {
  if (hasModuleAccess(roles, DIRECTOR_ROLES)) return "director";
  if (hasModuleAccess(roles, PLANNER_ROLES)) return "sales";
  if (hasModuleAccess(roles, HR_ROLES)) return "hr";
  if (hasModuleAccess(roles, FINANCE_ROLES)) return "finance";
  return "staff";
}

export const PRIMARY_ROLE_LABEL: Record<PrimaryRole, string> = {
  director: "Director",
  sales: "Sales & planning",
  hr: "HR",
  finance: "Finance",
  staff: "Team member",
};

export interface BarTab {
  label: string;
  path: string;
  icon: LucideIcon;
  /** Prefixes that highlight the tab. */
  prefixes: string[];
}

export interface BottomBarConfig {
  /** Tabs before the centre "+" button. */
  leading: BarTab[];
  /** Tabs after it (the More tab is always appended by the component). */
  trailing: BarTab[];
  showAdd: boolean;
  /** Label/icon of the last tab (default "More"). */
  more?: { label: string; icon: LucideIcon };
}

const HOME: BarTab = { label: "Home", path: "/", icon: Home, prefixes: ["/"] };
const CRM: BarTab = { label: "CRM", path: "/crm", icon: MessageSquare, prefixes: ["/crm"] };
const EVENTS: BarTab = { label: "Events", path: "/projects/events", icon: CalendarDays, prefixes: ["/projects/events"] };
const WEDDINGS: BarTab = { label: "Weddings", path: "/projects", icon: Heart, prefixes: ["/projects", "/venues", "/vendors"] };
const PEOPLE: BarTab = { label: "People", path: "/hr/staff-overview", icon: Users, prefixes: ["/hr"] };
const APPROVALS: BarTab = { label: "Approvals", path: "/hr/leaves", icon: ClipboardCheck, prefixes: ["/hr/leaves", "/hr/wfh"] };
const FINANCE: BarTab = { label: "Finance", path: "/finance/invoices", icon: Wallet, prefixes: ["/finance"] };
const REQUESTS: BarTab = { label: "Requests", path: "/my-leaves", icon: FileSignature, prefixes: ["/my-leaves"] };
const MY_WEDDINGS: BarTab = { label: "My Weddings", path: "/my-weddings", icon: Heart, prefixes: ["/my-weddings"] };
const ME: BarTab = { label: "Me", path: "/my-profile", icon: User, prefixes: ["/my-profile"] };

/** Bottom bar shaped by role (Main.dc.html, "One navigation, shaped by role"). */
export function getBottomBar(roles: string[]): BottomBarConfig {
  if (isEmployeeSelfServiceOnly(roles)) {
    // Home · My Weddings · + · Requests · Me (Main.dc.html). "Me" is the always-present More tab.
    return { leading: [HOME, MY_WEDDINGS], trailing: [REQUESTS], showAdd: true, more: { label: "Me", icon: User } };
  }
  // "+" opens /finance/expenses/new, which every admin-shell user can reach today.
  const showAdd = true;
  switch (getPrimaryRole(roles)) {
    case "director":
      return { leading: [HOME, CRM], trailing: [WEDDINGS], showAdd };
    case "sales":
      // A planner without a CRM role has no pipeline to open, so Events takes the CRM slot.
      return { leading: [HOME, hasModuleAccess(roles, CRM_ROLES) ? CRM : EVENTS], trailing: [WEDDINGS], showAdd };
    case "hr":
      return { leading: [HOME, PEOPLE], trailing: [APPROVALS], showAdd };
    case "finance":
      return { leading: [HOME, FINANCE], trailing: [WEDDINGS], showAdd };
    default:
      // Roles with no module of their own (e.g. Inbox User): Home plus self-service.
      return { leading: [HOME, REQUESTS], trailing: [ME], showAdd };
  }
}

export interface MoreSection {
  title: string;
  items: NavItem[];
}

/** Every role-allowed destination that is not already in the bottom bar or the top bar. */
export function getMoreSections(roles: string[], bar: BottomBarConfig): MoreSection[] {
  const inBar = new Set(["/", "/notifications", ...[...bar.leading, ...bar.trailing].map((t) => t.path)]);
  const seen = new Set(inBar);
  const take = (items: NavItem[]) =>
    items.filter((i) => {
      if (seen.has(i.path)) return false;
      seen.add(i.path);
      return true;
    });

  const sections: MoreSection[] = [{ title: "Me", items: take(SELF_SERVICE_ITEMS) }];
  if (!isEmployeeSelfServiceOnly(roles)) {
    for (const g of NAV_GROUPS) {
      if (!g.title) continue;
      const items = take(g.items.filter((i) => allowed(i, roles)));
      if (items.length) sections.push({ title: g.moreTitle ?? g.title, items });
    }
  }
  return sections.filter((s) => s.items.length > 0);
}

export interface PaletteGroup {
  heading: string;
  items: NavItem[];
}

/** Command palette entries: only links the user is allowed to open. */
export function getPaletteGroups(roles: string[]): PaletteGroup[] {
  const selfOnly = isEmployeeSelfServiceOnly(roles);
  const seen = new Set<string>();
  const dedupe = (items: NavItem[]) => items.filter((i) => !seen.has(i.path) && !!seen.add(i.path));

  const groups: PaletteGroup[] = getVisibleNavGroups(roles).map((g) => ({
    heading: g.title ?? "Go to",
    items: dedupe(g.items),
  }));
  const extras = dedupe(selfOnly ? [ADD_EXPENSE, ...SELF_SERVICE_ITEMS] : [...PALETTE_EXTRAS.filter((i) => allowed(i, roles)), ...SELF_SERVICE_ITEMS]);
  if (extras.length) groups.push({ heading: "Also", items: extras });
  return groups.filter((g) => g.items.length > 0);
}
