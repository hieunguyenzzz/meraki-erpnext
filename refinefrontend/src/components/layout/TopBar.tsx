import { Link } from "react-router";
import { usePermissions } from "@refinedev/core";
import { Bell, Search } from "lucide-react";
import { useSearch } from "@/context/search-context";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";
import { useMyNotifications } from "@/hooks/useMyNotifications";
import { isEmployeeSelfServiceOnly } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { NotificationBell } from "@/components/layout/notification-center";
import { UserNav } from "@/components/layout/user-nav";
import { Wordmark } from "@/components/layout/Wordmark";

const BELL_CLASS = "[&_svg]:size-[22px]";

function Breadcrumbs() {
  const crumbs = useBreadcrumbs();
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, i) => (
          <BreadcrumbItem key={i}>
            {i > 0 && <BreadcrumbSeparator />}
            {i === crumbs.length - 1 ? (
              <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
            ) : (
              <BreadcrumbLink asChild>
                <Link to={crumb.href ?? "/"}>{crumb.label}</Link>
              </BreadcrumbLink>
            )}
          </BreadcrumbItem>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/** Mobile bell: a plain link to /notifications (employee-only users cannot reach it, so they keep the dropdown). */
function MobileBellLink() {
  const { count } = useMyNotifications();
  return (
    <Link
      to="/notifications"
      aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
      className="relative flex h-12 w-12 items-center justify-center rounded-full hover:bg-muted"
    >
      <Bell className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden />
      {count > 0 && (
        <span className="absolute right-1 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-background bg-primary-fill px-1 text-[11px] font-bold text-primary-fill-foreground">
          {count}
        </span>
      )}
    </Link>
  );
}

/** Top bar on every screen: breadcrumbs (desktop), wordmark (mobile), search and the unread bell. */
export function TopBar() {
  const { setOpen } = useSearch();
  const { data } = usePermissions<string[]>({});
  const selfOnly = isEmployeeSelfServiceOnly(data ?? []);

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 pl-5 pr-3 backdrop-blur md:px-4 max-md:h-[68px] max-md:border-b-0">
      <div className="md:hidden">
        <Wordmark to={selfOnly ? "/my-profile" : "/"} />
      </div>
      <div className="hidden md:block">{!selfOnly && <Breadcrumbs />}</div>

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Search" className={BELL_CLASS}>
          <Search strokeWidth={1.75} />
        </Button>
        {selfOnly ? (
          <NotificationBell className={BELL_CLASS} />
        ) : (
          <>
            <div className="hidden md:block">
              <NotificationBell className={BELL_CLASS} />
            </div>
            <div className="md:hidden">
              <MobileBellLink />
            </div>
          </>
        )}
        {!selfOnly && (
          <div className="ml-1 hidden md:block">
            <UserNav />
          </div>
        )}
      </div>
    </header>
  );
}
