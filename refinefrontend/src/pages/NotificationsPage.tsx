import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useCustom, useCustomMutation } from "@refinedev/core";
import { Bell, Trash2, CheckCheck, Inbox, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

interface GroupedNotifications {
  label: string;
  items: PwaNotification[];
}

const DOC_ROUTES: Record<string, (name: string) => string> = {
  "Job Applicant": (name) => `/hr/recruiting/${encodeURIComponent(name)}`,
  "Lead": (name) => `/crm/leads/${encodeURIComponent(name)}`,
  "Employee": (name) => `/hr/employees/${encodeURIComponent(name)}`,
  "Project": (name) => `/projects/${encodeURIComponent(name)}`,
  "Purchase Invoice": (name) => `/finance/expenses/${encodeURIComponent(name)}`,
};

/**
 * Strip HTML tags to extract plain text.
 * Uses a temporary DOM element — safe here because the result is only
 * read via textContent (no re-insertion as HTML). Same pattern as
 * notification-center.tsx.
 */
function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html; // eslint-disable-line no-unsanitized/property
  return div.textContent ?? div.innerText ?? "";
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateStr);
}

function groupByDate(notifications: PwaNotification[]): GroupedNotifications[] {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const groups: GroupedNotifications[] = [];
  const groupMap = new Map<string, PwaNotification[]>();

  for (const notif of notifications) {
    const dateStr = new Date(notif.creation).toDateString();
    const label =
      dateStr === today
        ? "Today"
        : dateStr === yesterday
          ? "Yesterday"
          : formatDate(notif.creation);
    if (!groupMap.has(label)) {
      groupMap.set(label, []);
    }
    groupMap.get(label)!.push(notif);
  }

  for (const [label, items] of groupMap) {
    groups.push({ label, items });
  }

  return groups;
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { mutateAsync: customMutation } = useCustomMutation();
  const [page, setPage] = useState(1);
  const [allNotifications, setAllNotifications] = useState<PwaNotification[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const { query, result } = useCustom({
    url: "/api/method/get_all_notifications",
    method: "get",
    config: { query: { page, page_size: 50 } },
  });

  const message = (result?.data as any)?.message;
  const fetchedNotifs: PwaNotification[] = message?.notifications ?? [];
  const total: number = message?.total ?? 0;
  const unread: number = message?.unread ?? 0;

  // Track which fetch we've already merged to avoid re-running
  const lastMergedKey = useRef("");
  useEffect(() => {
    if (fetchedNotifs.length === 0) return;
    const key = fetchedNotifs.map((n) => n.name).join(",");
    if (key === lastMergedKey.current) return;
    lastMergedKey.current = key;

    if (page === 1) {
      setAllNotifications(fetchedNotifs);
    } else {
      setAllNotifications((prev) => {
        const existingNames = new Set(prev.map((n) => n.name));
        const unique = fetchedNotifs.filter((n) => !existingNames.has(n.name));
        return [...prev, ...unique];
      });
    }
  }, [fetchedNotifs, page]);

  const hasMore = allNotifications.length < total;

  const groups = useMemo(
    () => groupByDate(allNotifications),
    [allNotifications],
  );

  async function handleDismiss(notifName: string) {
    setProcessingId(notifName);
    try {
      await customMutation({
        url: "/api/method/handle_notification_action",
        method: "post",
        values: { notif_name: notifName, action: "read" },
      });
      setAllNotifications((prev) =>
        prev.map((n) => (n.name === notifName ? { ...n, read: 1 } : n)),
      );
      query.refetch();
    } catch {
      // user can retry
    } finally {
      setProcessingId(null);
    }
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    try {
      await customMutation({
        url: "/api/method/handle_notification_action",
        method: "post",
        values: { action: "read_all" },
      });
      setAllNotifications((prev) => prev.map((n) => ({ ...n, read: 1 })));
      query.refetch();
    } catch {
      // user can retry
    } finally {
      setMarkingAll(false);
    }
  }

  async function handleAction(notifName: string, action: "approve" | "reject") {
    setProcessingId(notifName);
    try {
      await customMutation({
        url: "/api/method/handle_notification_action",
        method: "post",
        values: { notif_name: notifName, action },
      });
      setAllNotifications((prev) =>
        prev.map((n) => (n.name === notifName ? { ...n, read: 1 } : n)),
      );
      query.refetch();
    } catch {
      // user can retry
    } finally {
      setProcessingId(null);
    }
  }

  function handleClick(notif: PwaNotification) {
    const routeFn = DOC_ROUTES[notif.reference_document_type];
    if (!routeFn) return;
    if (!notif.read) {
      handleDismiss(notif.name);
    }
    navigate(routeFn(notif.reference_document_name));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold">Notifications</h1>
            <p className="text-sm text-muted-foreground">
              {total} total{unread > 0 && `, ${unread} unread`}
            </p>
          </div>
        </div>
        {unread > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={markingAll}
          >
            <CheckCheck className="mr-1.5 h-4 w-4" />
            {markingAll ? "Marking..." : "Mark all as read"}
          </Button>
        )}
      </div>

      {/* Notification groups */}
      {allNotifications.length === 0 && !query.isLoading ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-muted-foreground">
          <Inbox className="mb-3 h-10 w-10" />
          <p className="text-sm">No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.label}>
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {group.label}
              </h2>
              <div className="space-y-1">
                {group.items.map((notif) => {
                  const routeFn = DOC_ROUTES[notif.reference_document_type];
                  const isClickable = !!routeFn;
                  const isProcessing = processingId === notif.name;

                  const isActionable = ["Leave Application", "Purchase Invoice"].includes(notif.reference_document_type);

                  return (
                    <div
                      key={notif.name}
                      className={`group flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors ${
                        isClickable
                          ? "cursor-pointer hover:bg-accent/50"
                          : ""
                      } ${!notif.read ? "border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20" : ""}`}
                      onClick={() => isClickable && handleClick(notif)}
                    >
                      {/* Unread dot */}
                      <div className="mt-1.5 flex-shrink-0">
                        {!notif.read ? (
                          <div className="h-2 w-2 rounded-full bg-blue-500" />
                        ) : (
                          <div className="h-2 w-2" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug">
                          {stripHtml(notif.message)}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          {notif.reference_document_type && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {notif.reference_document_type}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {timeAgo(notif.creation)}
                          </span>
                        </div>
                        {/* Approve / Reject for actionable notifications */}
                        {isActionable && !notif.read && (
                          <div className="mt-2 flex gap-1.5">
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 px-2.5 text-xs"
                              disabled={isProcessing}
                              onClick={(e) => { e.stopPropagation(); handleAction(notif.name, "approve"); }}
                            >
                              <Check className="mr-1 h-3 w-3" />
                              {isProcessing ? "..." : "Approve"}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 px-2.5 text-xs"
                              disabled={isProcessing}
                              onClick={(e) => { e.stopPropagation(); handleAction(notif.name, "reject"); }}
                            >
                              <X className="mr-1 h-3 w-3" />
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Dismiss button */}
                      {!notif.read && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 flex-shrink-0 p-0 opacity-0 group-hover:opacity-100"
                          disabled={isProcessing}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDismiss(notif.name);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={query.isLoading}
              >
                {query.isLoading ? "Loading..." : "Load more"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
