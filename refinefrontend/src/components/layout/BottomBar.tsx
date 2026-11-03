import { Link, useLocation } from "react-router";
import { usePermissions } from "@refinedev/core";
import { MoreHorizontal, Plus } from "lucide-react";
import { getBottomBar, matchLength, type BarTab } from "@/lib/navigation";
import { cn } from "@/lib/utils";

function Tab({ tab, active }: { tab: BarTab; active: boolean }) {
  return (
    <Link
      to={tab.path}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-14 flex-1 flex-col items-center gap-[3px] pt-2.5 text-[11px] font-semibold",
        active ? "text-primary" : "text-muted-foreground"
      )}
    >
      <tab.icon className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden />
      {tab.label}
    </Link>
  );
}

/** Mobile bottom bar (hidden from md up). Tabs are shaped by role in lib/navigation.ts. */
export function BottomBar() {
  const { pathname } = useLocation();
  const { data, isLoading } = usePermissions<string[]>({});
  const { leading, trailing, showAdd } = getBottomBar(data ?? []);

  // Empty bar until roles are known so employee-only users never flash the staff tabs.
  if (isLoading) {
    return <nav aria-hidden className="fixed inset-x-0 bottom-0 z-50 h-[84px] border-t bg-card md:hidden" />;
  }

  const tabs = [...leading, ...trailing];
  let activePath: string | null = null;
  let best = 0;
  for (const t of tabs) {
    const len = Math.max(...t.prefixes.map((p) => matchLength(pathname, p)));
    if (len > best) {
      best = len;
      activePath = t.path;
    }
  }
  const moreActive = pathname === "/more" || (!activePath && pathname !== "/" && pathname !== "/notifications");

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-50 flex items-start border-t bg-card px-1.5 md:hidden"
      style={{ height: "calc(84px + env(safe-area-inset-bottom, 0px))", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {leading.map((t) => (
        <Tab key={t.path} tab={t} active={t.path === activePath} />
      ))}
      {showAdd && (
        <div className="flex flex-1 justify-center">
          <Link
            to="/finance/expenses/new"
            aria-label="Add expense"
            className="-mt-[22px] flex h-16 w-16 items-center justify-center rounded-full border-4 border-background bg-primary-fill text-primary-fill-foreground shadow-lg"
          >
            <Plus className="h-7 w-7" strokeWidth={2.2} aria-hidden />
          </Link>
        </div>
      )}
      {trailing.map((t) => (
        <Tab key={t.path} tab={t} active={t.path === activePath} />
      ))}
      <Tab
        tab={{ label: "More", path: "/more", icon: MoreHorizontal, prefixes: [] }}
        active={moreActive}
      />
    </nav>
  );
}
