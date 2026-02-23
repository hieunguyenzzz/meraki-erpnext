import { useState } from "react";
import {
  usePermissions,
  useCustom,
  useCustomMutation,
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
  const invalidate = useInvalidate();
  const { mutateAsync: customMutation } = useCustomMutation();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const { query, result: notifResult } = useCustom({
    url: "/api/method/get_my_notifications",
    method: "get",
    queryOptions: { refetchInterval: 30_000 },
  });

  const notifications: PwaNotification[] = (notifResult?.data as any)?.message?.notifications ?? [];
  const count: number = (notifResult?.data as any)?.message?.total ?? 0;
  const refetch = query.refetch;

  async function handleAction(notifName: string, action: "read" | "approve" | "reject") {
    setProcessingId(notifName);
    try {
      await customMutation({
        url: "/api/method/handle_notification_action",
        method: "post",
        values: { notif_name: notifName, action },
      });
      if (action === "approve" || action === "reject") {
        invalidate({ resource: "Leave Application", invalidates: ["list"] });
      }
      refetch();
    } catch {
      // user can retry
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
                          onClick={() => handleAction(notif.name, "approve")}
                        >
                          <Check className="mr-1 h-3 w-3" />
                          {isProcessing ? "..." : "Approve"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 px-2.5 text-xs"
                          disabled={isProcessing}
                          onClick={() => handleAction(notif.name, "reject")}
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
                      onClick={() => handleAction(notif.name, "read")}
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
