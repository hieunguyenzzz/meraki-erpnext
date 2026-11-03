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
import { useNotificationActions } from "@/hooks/useNotificationActions";
import { DOC_ROUTES, canDecide } from "@/lib/notifications";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { cn } from "@/lib/utils";

export function NotificationBell({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { notifications, count, refetch } = useMyNotifications();
  const { processingId, outcomes, errors, markRead, decide } = useNotificationActions({
    // Leave the "Approved" / "Rejected" result visible for a moment before the row drops out of the unread list
    onChanged: () => void setTimeout(refetch, 1500),
  });
  // Approve/reject endpoints are HR-only; other approvers still see and open the notification.
  const { data: roles } = usePermissions<string[]>({});
  const isHr = hasModuleAccess(roles ?? [], HR_ROLES);

  function handleOpen(notif: PwaNotification) {
    const routeFn = DOC_ROUTES[notif.reference_document_type];
    if (!routeFn) return;
    markRead(notif);
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
      <DropdownMenuContent className="w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden p-0" align="end" forceMount>
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-sm font-semibold">Notifications{count > 0 && ` (${count})`}</p>
          <Link to="/notifications" className="text-sm font-semibold text-primary hover:underline">
            See all
          </Link>
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
                (type === "Leave Application" || type === "Attendance Request") && canDecide(notif, isHr);
              return (
                <NotificationItem
                  key={notif.name}
                  notif={notif}
                  compact
                  actionable={actionable}
                  outcome={outcomes[notif.name]}
                  error={errors[notif.name]}
                  processing={processingId === notif.name}
                  onOpen={handleOpen}
                  onDismiss={markRead}
                  onDecide={decide}
                />
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
