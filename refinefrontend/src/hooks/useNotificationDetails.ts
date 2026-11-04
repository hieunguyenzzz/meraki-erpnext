import { useCustom } from "@refinedev/core";
import { keepPreviousData } from "@tanstack/react-query";
import type { PwaNotification } from "@/hooks/useMyNotifications";
import type { NotificationDetails } from "@/lib/notifications";

interface DetailsResponse {
  details?: Record<string, NotificationDetails>;
}

const DETAILED_TYPES = new Set(["Leave Application", "Attendance Request", "Purchase Invoice"]);

/** Titles, facts and current state for the leave / WFH / expense approval notifications, fetched in ONE call for the whole list. */
export function useNotificationDetails(notifications: PwaNotification[]) {
  const names = notifications
    .filter((n) => DETAILED_TYPES.has(n.reference_document_type))
    .slice(0, 100)
    .map((n) => n.name)
    .sort();

  const { result } = useCustom({
    url: "/inquiry-api/notification/details",
    method: "post",
    config: { payload: { names } },
    queryOptions: { enabled: names.length > 0, staleTime: 30_000, placeholderData: keepPreviousData },
  });
  // Details are a nice-to-have: if the call fails the cards simply show the message text.
  return (result?.data as DetailsResponse | undefined)?.details ?? {};
}
