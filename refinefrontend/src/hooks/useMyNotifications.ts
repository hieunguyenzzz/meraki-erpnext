import { useCustom } from "@refinedev/core";

export interface PwaNotification {
  name: string;
  from_user: string;
  message: string;
  read: number;
  reference_document_type: string;
  reference_document_name: string;
  creation: string;
  is_pending: boolean;
}

interface NotificationsResponse {
  message?: { notifications?: PwaNotification[]; total?: number };
}

/** The current user's unread notifications (shared by the bell, sidebar and badges). */
export function useMyNotifications() {
  const { query, result } = useCustom({
    url: "/api/method/get_my_notifications",
    method: "get",
    queryOptions: { refetchInterval: 30_000 },
  });
  const message = (result?.data as NotificationsResponse | undefined)?.message;
  const notifications = message?.notifications ?? [];

  return {
    notifications,
    count: message?.total ?? 0,
    refetch: query.refetch,
  };
}
