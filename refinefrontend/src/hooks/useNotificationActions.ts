import { useEffect, useRef, useState } from "react";
import { useCustomMutation, useInvalidate } from "@refinedev/core";
import { useQueryClient } from "@tanstack/react-query";
import type { PwaNotification } from "@/hooks/useMyNotifications";
import type { ApprovalAction } from "@/lib/notifications";

export type Outcome = "approved" | "rejected";

interface Options {
  /** Called when a notification was marked read, so a local copy of the list can follow. */
  onRead?: (name: string) => void;
}

/**
 * Read / approve / reject for PWA notifications, shared by the page and the bell.
 * Approve/reject is optimistic: `outcomes` flips immediately and is rolled back (with `errors`) on failure.
 */
export function useNotificationActions({ onRead }: Options = {}) {
  const { mutateAsync: customMutation } = useCustomMutation();
  const invalidate = useInvalidate();
  const queryClient = useQueryClient();
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const setProcessing = (name: string, on: boolean) =>
    setProcessingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(name);
      else next.delete(name);
      return next;
    });

  /** Reload the page's list and the bell together so a change in one shows in the other. */
  const refreshNotifications = (delayMs = 0) => {
    const run = () =>
      queryClient.invalidateQueries({
        predicate: (q) => {
          const key = JSON.stringify(q.queryKey);
          return key.includes("get_all_notifications") || key.includes("get_my_notifications");
        },
      });
    clearTimeout(timer.current);
    if (delayMs > 0) timer.current = setTimeout(run, delayMs);
    else run();
  };
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setError = (name: string, message: string | null) =>
    setErrors((prev) => {
      const next = { ...prev };
      if (message) next[name] = message;
      else delete next[name];
      return next;
    });

  const post = (url: string) => customMutation({ url, method: "post", values: {} });
  const readUrl = (name: string) => `/inquiry-api/notification/${encodeURIComponent(name)}/read`;

  /** Mark one notification read. Returns whether it worked. */
  async function markRead(notif: PwaNotification): Promise<boolean> {
    setProcessing(notif.name, true);
    setError(notif.name, null);
    try {
      await post(readUrl(notif.name));
      onRead?.(notif.name);
      refreshNotifications();
      return true;
    } catch (err) {
      console.error("notification_read_failed", { name: notif.name, err });
      setError(notif.name, "Could not mark as read. Try again.");
      return false;
    } finally {
      setProcessing(notif.name, false);
    }
  }

  /** Mark every unread notification of the user read; the caller decides what to show on failure. */
  async function markAllRead(): Promise<boolean> {
    try {
      await customMutation({ url: "/api/method/handle_notification_action", method: "post", values: { action: "read_all" } });
      refreshNotifications();
      return true;
    } catch (err) {
      console.error("notification_read_all_failed", err);
      return false;
    }
  }

  async function decide(notif: PwaNotification, action: ApprovalAction): Promise<void> {
    const outcome: Outcome = action === "approve" ? "approved" : "rejected";
    setProcessing(notif.name, true);
    setError(notif.name, null);
    setOutcomes((prev) => ({ ...prev, [notif.name]: outcome }));
    try {
      const id = encodeURIComponent(notif.reference_document_name);
      // Leave/WFH go through the webhook API so the doc is properly submitted and the
      // Google Calendar event is added. Purchase Invoice has no webhook endpoint, so it keeps the Server Script.
      if (notif.reference_document_type === "Leave Application") {
        await post(`/inquiry-api/leave/${id}/${action}`);
        invalidate({ resource: "Leave Application", invalidates: ["list"] });
      } else if (notif.reference_document_type === "Attendance Request") {
        await post(`/inquiry-api/wfh/${id}/${action}`);
      } else {
        await customMutation({
          url: "/api/method/handle_notification_action",
          method: "post",
          values: { notif_name: notif.name, action },
        });
      }
      // The decision is done; failing to mark the notice read must not undo it.
      try {
        await post(readUrl(notif.name));
        onRead?.(notif.name);
      } catch (err) {
        console.error("notification_read_after_decision_failed", { name: notif.name, err });
      }
      // Leave the "Approved" / "Rejected" result visible for a moment before the row drops out of the bell
      refreshNotifications(1500);
    } catch (err) {
      console.error("notification_decision_failed", { name: notif.name, action, err });
      setOutcomes((prev) => {
        const next = { ...prev };
        delete next[notif.name];
        return next;
      });
      setError(notif.name, `Could not ${action} this request. Nothing was changed, try again.`);
    } finally {
      setProcessing(notif.name, false);
    }
  }

  return { processingIds, outcomes, errors, markRead, markAllRead, decide };
}
