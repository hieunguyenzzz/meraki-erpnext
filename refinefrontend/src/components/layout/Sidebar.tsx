import { Link, useLocation } from "react-router";
import { useGetIdentity, useLogout, usePermissions } from "@refinedev/core";
import { LogOut, Search } from "lucide-react";
import { useSearch } from "@/context/search-context";
import { useMyEmployee } from "@/hooks/useMyEmployee";
import { useMyNotifications } from "@/hooks/useMyNotifications";
import { usePendingLeaveCount } from "@/hooks/usePendingLeaveCount";
import { usePendingWfhCount } from "@/hooks/usePendingWfhCount";
import {
  PRIMARY_ROLE_LABEL, getActiveItem, getPrimaryRole, getVisibleNavGroups,
  type BadgeKey, type NavItem,
} from "@/lib/navigation";
import { getInitials } from "@/lib/initials";
import { HR_ROLES, isEmployeeSelfServiceOnly } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { ThemeSwitch } from "@/components/theme-switch";
import { Wordmark } from "@/components/layout/Wordmark";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const BADGE_TONE: Record<BadgeKey, string> = {
  notifications: "bg-primary-fill text-primary-fill-foreground",
  leaves: "bg-primary-fill text-primary-fill-foreground",
  wfh: "bg-primary-fill text-primary-fill-foreground",
};

function SidebarLink({ item, active, badge }: { item: NavItem; active: boolean; badge: number }) {
  return (
    <Link
      to={item.path}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-[38px] items-center gap-2.5 rounded-[10px] px-3 text-sm transition-colors",
        active
          ? "bg-accent font-semibold text-accent-foreground"
          : "font-medium text-foreground/80 hover:bg-muted"
      )}
    >
      <item.icon className="h-[19px] w-[19px] shrink-0" strokeWidth={1.75} aria-hidden />
      <span className="flex-1">{item.label}</span>
      {item.badge && badge > 0 && (
        <span className={cn("rounded-[9px] px-[7px] py-px text-xs font-bold", BADGE_TONE[item.badge])}>
          {badge}
        </span>
      )}
    </Link>
  );
}

function UserFooter({ roles }: { roles: string[] }) {
  const { data: identity } = useGetIdentity<{ email: string; name?: string }>();
  const { employee } = useMyEmployee();
  const { mutate: logout } = useLogout({});

  const name = employee?.employee_name ?? identity?.name ?? identity?.email ?? "";
  const initials = getInitials(name);

  return (
    <div className="mt-3 flex shrink-0 items-center gap-2.5 border-t px-3 pt-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning-soft text-[13px] font-bold text-warning-soft-foreground">
        {initials}
      </span>
      <span className="min-w-0 flex-1 text-sm leading-tight">
        <b className="block truncate">{name}</b>
        <span className="text-xs text-muted-foreground">
          {PRIMARY_ROLE_LABEL[getPrimaryRole(roles)]}
        </span>
      </span>
      <ThemeSwitch />
      <button
        type="button"
        onClick={() => logout()}
        aria-label="Log out"
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Desktop sidebar (hidden below md). Groups are filtered by role in lib/navigation.ts. */
export function Sidebar() {
  const { pathname } = useLocation();
  const { data, isLoading } = usePermissions<string[]>({});
  const roles = data ?? [];
  const { setOpen } = useSearch();
  const { count } = useMyNotifications();
  const isHr = roles.some((r) => HR_ROLES.includes(r));
  const badges: Record<BadgeKey, number> = {
    notifications: count,
    leaves: usePendingLeaveCount(isHr),
    wfh: usePendingWfhCount(isHr),
  };

  // Render an empty column until roles are known so employee-only users never flash the staff nav.
  if (isLoading) {
    return <aside className="hidden h-dvh w-[248px] shrink-0 border-r bg-sidebar md:block" aria-hidden />;
  }

  const groups = getVisibleNavGroups(roles);
  const active = getActiveItem(pathname, groups.flatMap((g) => g.items));

  return (
    <aside className="hidden h-dvh w-[248px] shrink-0 flex-col print:hidden border-r bg-sidebar px-3.5 py-5 text-sidebar-foreground md:flex">
      <Wordmark large to={isEmployeeSelfServiceOnly(roles) ? "/my-profile" : "/"} className="mb-3.5 shrink-0 px-3 pt-1" />
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-1.5 flex h-10 shrink-0 items-center gap-2 rounded-[10px] border border-input bg-background px-3 text-sm text-muted-foreground hover:bg-muted"
      >
        <Search className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        <span className="flex-1 text-left">Jump to…</span>
        <kbd aria-hidden className="rounded-[5px] border border-input px-1.5 py-px font-sans text-[11px]">
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>

      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {groups.map((g) => (
          <div key={g.title ?? "top"} className="flex flex-col gap-0.5">
            {g.title && (
              <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">
                {g.title}
              </div>
            )}
            {g.items.map((item) => (
              <SidebarLink
                key={item.path}
                item={item}
                active={active?.path === item.path}
                badge={item.badge ? badges[item.badge] : 0}
              />
            ))}
          </div>
        ))}
      </nav>

      <UserFooter roles={roles} />
    </aside>
  );
}
