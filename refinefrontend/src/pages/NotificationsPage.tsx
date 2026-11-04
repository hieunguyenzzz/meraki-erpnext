import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router";
import { useCustom, useCustomMutation, usePermissions } from "@refinedev/core";
import { HR_ROLES, hasModuleAccess } from "@/lib/roles";
import { AlertCircle, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PwaNotification } from "@/hooks/useMyNotifications";
import { useNotificationDetails } from "@/hooks/useNotificationDetails";
import { useNotificationActions } from "@/hooks/useNotificationActions";
import { DOC_ROUTES, FILTER_TYPES, canDecide, groupByDay, labelForType } from "@/lib/notifications";
import { NotificationFilters, type TypeCount } from "@/components/notifications/NotificationFilters";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { NotificationEmpty, NotificationError, NotificationSkeleton } from "@/components/notifications/NotificationStates";

const FILTER_STORAGE_KEY = "notifications.typeFilter";

function loadSavedFilter(): string {
  try {
    return localStorage.getItem(FILTER_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveFilter(type: string) {
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, type);
  } catch {
    // storage unavailable (private mode etc.) — the filter just won't persist
  }
}

export default function NotificationsPage() {
  // Leave/WFH approve/reject endpoints are HR-only; other approvers still see and open the notification.
  const { data: roles } = usePermissions<string[]>({});
  const canApprove = hasModuleAccess(roles ?? [], HR_ROLES);
  const navigate = useNavigate();
  const { mutateAsync: customMutation } = useCustomMutation();
  const [page, setPage] = useState(1);
  const [allNotifications, setAllNotifications] = useState<PwaNotification[]>([]);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docType, setDocType] = useState(loadSavedFilter); // "" = All
  const [serverCounts, setServerCounts] = useState<TypeCount[] | null>(null);

  // dataProvider.custom ignores `config.query`, so the params go in the URL itself
  const params = new URLSearchParams({ page: String(page), page_size: "50" });
  if (docType) params.set("doc_type", docType);

  const { query, result } = useCustom({
    url: `/api/method/get_all_notifications?${params}`,
    method: "get",
  });

  const message = (result?.data as any)?.message;
  const fetchedNotifs: PwaNotification[] = message?.notifications ?? [];
  const total: number = message?.total ?? 0;
  const unread: number = message?.unread ?? 0;

  // type_counts is unfiltered, so keep the last one to avoid chip flicker while a new type loads
  useEffect(() => {
    if (message?.type_counts) {
      setServerCounts(message.type_counts);
    }
  }, [message?.type_counts]);

  // The standard categories always show (even at 0); any other type the server reports follows them
  const typeCounts = useMemo<TypeCount[] | null>(() => {
    if (!serverCounts) return null;
    const byType = new Map(serverCounts.map((t) => [t.type, t]));
    const standard = FILTER_TYPES.map((type) => byType.get(type) ?? { type, total: 0, unread: 0 });
    const extra = serverCounts.filter((t) => !FILTER_TYPES.includes(t.type)).sort((a, b) => b.total - a.total);
    return [...standard, ...extra];
  }, [serverCounts]);

  // Saved type is not a chip any more -> back to All
  useEffect(() => {
    if (typeCounts && docType && !typeCounts.some((t) => t.type === docType)) {
      selectType("");
    }
  }, [typeCounts, docType]);

  function selectType(type: string) {
    if (type === docType) return;
    saveFilter(type);
    setError(null);
    setDocType(type);
    setPage(1);
    setAllNotifications([]);
    lastMergedKey.current = "";
  }

  // Track which fetch we've already merged to avoid re-running
  const lastMergedKey = useRef("");
  useEffect(() => {
    // While a new type/page is loading, `result` may still hold the previous query's data
    if (query.isFetching || fetchedNotifs.length === 0) return;
    // Include read/pending so a refetch after a decision is merged, not skipped
    const key = fetchedNotifs.map((n) => `${n.name}:${n.read}:${n.is_pending}`).join(",");
    if (key === lastMergedKey.current) return;
    lastMergedKey.current = key;

    if (page === 1) {
      setAllNotifications(fetchedNotifs);
    } else {
      setAllNotifications((prev) => {
        const fresh = new Map(fetchedNotifs.map((n) => [n.name, n]));
        const known = new Set(prev.map((n) => n.name));
        return [...prev.map((n) => fresh.get(n.name) ?? n), ...fetchedNotifs.filter((n) => !known.has(n.name))];
      });
    }
  }, [fetchedNotifs, page, query.isFetching]);

  const hasMore = allNotifications.length < total;

  async function handleMarkAllRead() {
    setMarkingAll(true);
    setError(null);
    try {
      await customMutation({
        url: "/api/method/handle_notification_action",
        method: "post",
        values: { action: "read_all", ...(docType && { doc_type: docType }) },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark notifications as read");
    } finally {
      // Always reload from the server so the list and counts are never stale, even after a failure
      setMarkingAll(false);
      setPage(1);
      setAllNotifications([]);
      lastMergedKey.current = "";
      query.refetch();
    }
  }

  const { processingIds, outcomes, errors, markRead, decide } = useNotificationActions({
    onRead: (name) => setAllNotifications((prev) => prev.map((n) => (n.name === name ? { ...n, read: 1 } : n))),
  });

  function handleOpen(notif: PwaNotification) {
    const routeFn = DOC_ROUTES[notif.reference_document_type];
    if (!notif.read) markRead(notif);
    if (!routeFn) return; // e.g. Leave notices: tapping just marks them read
    navigate(routeFn(notif.reference_document_name));
  }

  const details = useNotificationDetails(allNotifications);

  const showSkeleton = allNotifications.length === 0 && query.isFetching;
  const showError = allNotifications.length === 0 && query.isError && !query.isFetching;

  return (
    <div className="mx-auto max-w-[920px]">
      <div className="flex items-center justify-between gap-2 pb-1">
        <h1 className="text-xl font-semibold md:font-display md:text-4xl md:leading-10">Notifications</h1>
        {unread > 0 && (
          <Button
            variant="ghost"
            className="text-primary hover:text-primary max-md:h-11"
            onClick={handleMarkAllRead}
            disabled={markingAll}
          >
            <CheckCheck aria-hidden />
            {markingAll ? "Marking..." : docType ? `Mark ${labelForType(docType)} as read` : "Mark all as read"}
          </Button>
        )}
      </div>

      {typeCounts && typeCounts.length > 0 && (
        <div className="sticky -top-4 z-10 -mx-4 bg-background px-4 pb-2 pt-4 md:static md:mx-0 md:px-0 md:pt-3">
          <NotificationFilters types={typeCounts} selected={docType} onSelect={selectType} labelFor={labelForType} />
        </div>
      )}

      {error && (
        <div role="alert" className="mb-3 flex items-center gap-2 rounded-lg border border-destructive/20 bg-danger-soft p-3 text-sm text-danger-soft-foreground">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          {error}
        </div>
      )}

      {showSkeleton ? (
        <NotificationSkeleton />
      ) : showError ? (
        <NotificationError onRetry={() => query.refetch()} />
      ) : allNotifications.length === 0 ? (
        <NotificationEmpty filtered={!!docType} />
      ) : (
        <div className="mt-1 space-y-4 md:mt-2">
          {groupByDay(allNotifications).map((group) => (
            <section key={group.label}>
              <h2 className="px-1 pb-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                {group.label}
              </h2>
              <div className="divide-y overflow-hidden rounded-card border bg-card">
                {group.items.map((notif) => (
                  <NotificationItem
                    key={notif.name}
                    notif={notif}
                    actionable={canDecide(notif, canApprove)}
                    outcome={outcomes[notif.name]}
                    error={errors[notif.name]}
                    details={details[notif.name]}
                    processing={processingIds.has(notif.name)}
                    onOpen={handleOpen}
                    onDismiss={markRead}
                    onDecide={decide}
                  />
                ))}
              </div>
            </section>
          ))}

          {hasMore && (
            <div className="flex justify-center">
              <Button variant="outline" className="md:h-11 md:px-[22px]" onClick={() => setPage((p) => p + 1)} disabled={query.isFetching}>
                {query.isFetching ? "Loading..." : "Load more"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
