import { useCustom } from "@refinedev/core";
import type { PwaNotification } from "@/hooks/useMyNotifications";
import type { NotificationDetails } from "@/lib/notifications";

interface DetailsResponse {
  details?: Record<string, NotificationDetails>;
}

/** Leave / WFH / expense facts for the pending notifications, fetched in ONE call for the whole list. */
export function useNotificationDetails(notifications: PwaNotification[]) {
  const names = notifications
    .filter((n) => n.is_pending)
    .slice(0, 100)
    .map((n) => n.name)
    .sort();

  const { result } = useCustom({
    url: "/inquiry-api/notification/details",
    method: "post",
    config: { payload: { names } },
    queryOptions: { enabled: names.length > 0, staleTime: 30_000 },
  });
  // Details are a nice-to-have: if the call fails the cards simply show the message text.
  return (result?.data as DetailsResponse | undefined)?.details ?? {};
}
