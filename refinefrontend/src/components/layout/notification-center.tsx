import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { usePermissions } from "@refinedev/core";
import { HR_ROLES, hasModuleAccess } from "@/lib/roles";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMyNotifications, type PwaNotification } from "@/hooks/useMyNotifications";
import { useNotificationDetails } from "@/hooks/useNotificationDetails";
import { useNotificationActions } from "@/hooks/useNotificationActions";
import { DOC_ROUTES, canDecide } from "@/lib/notifications";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { cn } from "@/lib/utils";

export function NotificationBell({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { notifications, count } = useMyNotifications();
  const { processingIds, outcomes, errors, markRead, markAllRead, decide } = useNotificationActions();
  const { details, settled } = useNotificationDetails(notifications);
  const [markingAll, setMarkingAll] = useState(false);
  // Approve/reject endpoints are HR-only; other approvers still see and open the notification.
  const { data: roles } = usePermissions<string[]>({});
  const isHr = hasModuleAccess(roles ?? [], HR_ROLES);

  async function handleMarkAll() {
    if (markingAll) return; // a second click while the first is in flight
    setMarkingAll(true);
    try {
      await markAllRead();
    } finally {
      setMarkingAll(false);
    }
  }

  function handleOpen(notif: PwaNotification) {
    const routeFn = DOC_ROUTES[notif.reference_document_type];
    markRead(notif);
    if (!routeFn) return; // no record page (e.g. Leave): tapping just marks it read
    navigate(routeFn(notif.reference_document_name));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("relative", className)}>
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <span className="absolute top-0 right-0 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-background bg-primary-fill px-1 text-[11px] font-bold text-primary-fill-foreground">
              {count}
            </span>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[420px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[18px] p-0" align="end" forceMount>
        <div className="flex items-center justify-between px-4 py-3.5">
          <p className="text-base font-semibold">Notifications</p>
          {count > 0 && (
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={markingAll}
              className="h-8 rounded-md text-[13px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:no-underline"
            >
              {markingAll ? "Marking..." : "Mark all as read"}
            </button>
          )}
        </div>
        <DropdownMenuSeparator className="my-0" />
        {count === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">No pending notifications</div>
        ) : (
          <div className="max-h-[420px] divide-y overflow-y-auto">
            {notifications.map((notif) => {
              const type = notif.reference_document_type;
              // Bell approvals stay limited to still-pending leave / WFH requests (never outcome notices).
              const actionable =
                (type === "Leave Application" || type === "Attendance Request") && canDecide(notif, isHr) && settled(notif.name);
              return (
                <NotificationItem
                  key={notif.name}
                  notif={notif}
                  compact
                  actionable={actionable}
                  outcome={outcomes[notif.name]}
                  error={errors[notif.name]}
                  details={details[notif.name]}
                  processing={processingIds.has(notif.name)}
                  onOpen={handleOpen}
                  onDismiss={markRead}
                  onDecide={decide}
                />
              );
            })}
          </div>
        )}
        <Link
          to="/notifications"
          className="flex h-12 items-center justify-center border-t text-sm font-semibold text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          See all notifications
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
