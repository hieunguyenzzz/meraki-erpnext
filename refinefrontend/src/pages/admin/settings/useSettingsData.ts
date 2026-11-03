import { useMemo } from "react";
import { useList } from "@refinedev/core";

export interface Designation {
  name: string;
}

export interface NotificationRule {
  name: string;
  subject: string;
  message: string;
  enabled: number;
  event: string;
  document_type: string;
  channel: string;
}

export function useDesignations() {
  const { result, query } = useList<Designation>({
    resource: "Designation",
    pagination: { mode: "off" },
    sorters: [{ field: "name", order: "asc" }],
    meta: { fields: ["name"] },
  });
  const designations = useMemo(() => (result?.data ?? []) as Designation[], [result]);
  return { designations, query };
}

export function useNotificationRules() {
  const { result, query } = useList<NotificationRule>({
    resource: "Notification",
    pagination: { mode: "off" },
    sorters: [{ field: "document_type", order: "asc" }],
    meta: {
      fields: ["name", "subject", "message", "enabled", "event", "document_type", "channel"],
    },
  });
  const notifications = useMemo(() => (result?.data ?? []) as NotificationRule[], [result]);
  return { notifications, query };
}
