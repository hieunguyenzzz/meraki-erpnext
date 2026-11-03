import { useState } from "react";
import { useNavigate } from "react-router";
import { useCustomMutation, useInvalidate, usePermissions } from "@refinedev/core";
import { HR_ROLES, hasModuleAccess } from "@/lib/roles";
import { Bell, Check, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMyNotifications, type PwaNotification } from "@/hooks/useMyNotifications";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";

const DOC_ROUTES: Record<string, (name: string) => string> = {
  "Job Applicant": (name) => `/hr/recruiting/${encodeURIComponent(name)}`,
  "Lead": (name) => `/crm/leads/${encodeURIComponent(name)}`,
  "Employee": (name) => `/hr/employees/${encodeURIComponent(name)}`,
  "Project": (name) => `/projects/${encodeURIComponent(name)}`,
};

export function NotificationBell({ className }: { className?: string }) {
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { mutateAsync: customMutation } = useCustomMutation();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const { notifications, count, refetch } = useMyNotifications();
  // Approve/reject endpoints are HR-only; other approvers still see and open the notification.
  const { data: roles } = usePermissions<string[]>({});
  const canApprove = hasModuleAccess(roles ?? [], HR_ROLES);

  async function handleAction(notif: PwaNotification, action: "read" | "approve" | "reject") {
    setProcessingId(notif.name);
    try {
      if (action === "approve" || action === "reject") {
        const id = encodeURIComponent(notif.reference_document_name);
        if (notif.reference_document_type === "Leave Application") {
          await customMutation({
            url: `/inquiry-api/leave/${id}/${action}`,
            method: "post",
            values: {},
          });
          invalidate({ resource: "Leave Application", invalidates: ["list"] });
        } else if (notif.reference_document_type === "Attendance Request") {
          await customMutation({
            url: `/inquiry-api/wfh/${id}/${action}`,
            method: "post",
            values: {},
          });
        }
      }
      // Mark notification as read (dismiss from bell)
      await customMutation({
        url: `/inquiry-api/notification/${encodeURIComponent(notif.name)}/read`,
        method: "post",
        values: {},
      });
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
              const isWfh = notif.reference_document_type === "Attendance Request";
              // Only show Approve/Reject on still-pending requests (the approver's copy),
              // never on outcome notices like "Your leave has been Approved".
              const isActionable = canApprove && notif.is_pending && (isLeave || isWfh);
              const isProcessing = processingId === notif.name;

              const routeFn = DOC_ROUTES[notif.reference_document_type];
              const targetUrl = routeFn ? routeFn(notif.reference_document_name) : null;

              return (
                <div key={notif.name} className="border-b px-3 py-2.5 last:border-0">
                  <div
                    className={targetUrl ? "cursor-pointer hover:text-primary transition-colors" : ""}
                    onClick={() => {
                      if (!targetUrl) return;
                      handleAction(notif, "read");
                      navigate(targetUrl);
                    }}
                  >
                    <p className="text-sm leading-snug">{stripHtml(notif.message)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(notif.creation)}
                    </p>
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    {isActionable && (
                      <>
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 px-2.5 text-xs"
                          disabled={isProcessing}
                          onClick={() => handleAction(notif, "approve")}
                        >
                          <Check className="mr-1 h-3 w-3" />
                          {isProcessing ? "..." : "Approve"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 px-2.5 text-xs"
                          disabled={isProcessing}
                          onClick={() => handleAction(notif, "reject")}
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
                      onClick={() => handleAction(notif, "read")}
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
