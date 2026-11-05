import { useMemo } from "react";
import { keepPreviousData, useQueries } from "@tanstack/react-query";
import type { PwaNotification } from "@/hooks/useMyNotifications";
import { needsDetails, type NotificationDetails } from "@/lib/notifications";

type DetailsMap = Record<string, NotificationDetails>;

/** The backend accepts at most this many names per call. */
const CHUNK = 100;

async function fetchDetails(names: string[]): Promise<DetailsMap> {
  const res = await fetch("/inquiry-api/notification/details", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ names }),
  });
  if (!res.ok) throw new Error(`Notification details failed (${res.status})`);
  return ((await res.json()) as { details?: DetailsMap }).details ?? {};
}

/**
 * Titles, facts and current state for the leave / WFH / expense approval notifications,
 * fetched in chunks of 100 so long lists are fully covered.
 *
 * `settled(name)` says whether the answer for that notification is in (or the call failed, in which
 * case the server's own pending flag is all there is). Callers hold back Approve / Reject until then.
 */
export function useNotificationDetails(notifications: PwaNotification[]) {
  const chunks = useMemo(() => {
    const names = notifications.filter((n) => needsDetails(n.reference_document_type)).map((n) => n.name);
    return Array.from({ length: Math.ceil(names.length / CHUNK) }, (_, i) => names.slice(i * CHUNK, (i + 1) * CHUNK));
  }, [notifications]);

  const results = useQueries({
    queries: chunks.map((names) => ({
      queryKey: ["notification-details", names],
      queryFn: () => fetchDetails(names),
      staleTime: 30_000,
      placeholderData: keepPreviousData,
    })),
  });

  const details: DetailsMap = {};
  const settledNames = new Set<string>();
  results.forEach((r, i) => {
    Object.assign(details, r.data);
    if (r.isError) console.error("notification_details_failed", r.error);
    if (r.isError || (r.isSuccess && !r.isPlaceholderData)) chunks[i].forEach((name) => settledNames.add(name));
  });

  return { details, settled: (name: string) => settledNames.has(name) };
}
