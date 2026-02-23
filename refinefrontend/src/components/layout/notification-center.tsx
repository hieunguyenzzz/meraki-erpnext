import { useState } from "react";
import {
  useGetIdentity,
  useList,
  usePermissions,
  useCustomMutation,
  useUpdate,
  useInvalidate,
} from "@refinedev/core";
import { Bell, Check, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HR_ROLES, hasModuleAccess } from "@/lib/roles";
import { formatDate } from "@/lib/format";

interface PwaNotification {
  name: string;
  to_user: string;
  from_user: string;
  message: string;
  read: number;
  reference_document_type: string;
  reference_document_name: string;
  creation: string;
}

export function NotificationCenter() {
  const { data: roles } = usePermissions<string[]>({});
  const userRoles = roles ?? [];

  if (!hasModuleAccess(userRoles, HR_ROLES)) return null;

  return <NotificationBell />;
}

function NotificationBell() {
  const { data: identity } = useGetIdentity<{ email: string }>();
  const email = identity?.email ?? "";
  const invalidate = useInvalidate();
  const { mutateAsync: customMutation } = useCustomMutation();
  const { mutate: updateNotification } = useUpdate();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const { result } = useList<PwaNotification>({
    resource: "PWA Notification",
    filters: [
      { field: "to_user", operator: "eq", value: email },
      { field: "read", operator: "eq", value: 0 },
    ],
    sorters: [{ field: "creation", order: "desc" }],
    pagination: { pageSize: 20 },
    meta: {
      fields: [
        "name",
        "to_user",
        "from_user",
        "message",
        "read",
        "reference_document_type",
        "reference_document_name",
        "creation",
      ],
    },
    queryOptions: { enabled: !!email, refetchInterval: 60000 },
  });

  const notifications = result?.data ?? [];
  const count = notifications.length;

  function markRead(notifName: string) {
    updateNotification({
      resource: "PWA Notification",
      id: notifName,
      values: { read: 1 },
    });
    invalidate({ resource: "PWA Notification", invalidates: ["list"] });
  }

  async function submitLeaveApplication(appName: string, status: "Approved" | "Rejected") {
    await customMutation({
      url: "/api/method/update_leave_status",
      method: "post",
      values: { name: appName, status },
    });
  }

  async function handleApprove(appName: string, notifName: string) {
    setProcessingId(notifName);
    try {
      await submitLeaveApplication(appName, "Approved");
      invalidate({ resource: "Leave Application", invalidates: ["list"] });
      markRead(notifName);
    } catch {
      // silently fail — user can retry
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(appName: string, notifName: string) {
    setProcessingId(notifName);
    try {
      await submitLeaveApplication(appName, "Rejected");
      invalidate({ resource: "Leave Application", invalidates: ["list"] });
      markRead(notifName);
    } catch {
      // silently fail
    } finally {
      setProcessingId(null);
    }
  }

  function stripHtml(html: string): string {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent ?? div.innerText ?? "";
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {count}
            </span>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80" align="end" forceMount>
        <DropdownMenuLabel>Notifications{count > 0 && ` (${count})`}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {count === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No pending notifications
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {notifications.map((notif) => {
              const isLeave = notif.reference_document_type === "Leave Application";
              const isProcessing = processingId === notif.name;

              return (
                <div key={notif.name} className="border-b px-3 py-2.5 last:border-0">
                  <p className="text-sm leading-snug">{stripHtml(notif.message)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(notif.creation)}
                  </p>
                  <div className="mt-2 flex gap-1.5">
                    {isLeave && (
                      <>
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 px-2.5 text-xs"
                          disabled={isProcessing}
                          onClick={() => handleApprove(notif.reference_document_name, notif.name)}
                        >
                          <Check className="mr-1 h-3 w-3" />
                          {isProcessing ? "..." : "Approve"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 px-2.5 text-xs"
                          disabled={isProcessing}
                          onClick={() => handleReject(notif.reference_document_name, notif.name)}
                        >
                          <X className="mr-1 h-3 w-3" />
                          Reject
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs ml-auto"
                      disabled={isProcessing}
                      onClick={() => markRead(notif.name)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
