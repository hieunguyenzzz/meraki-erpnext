import { useState } from "react";
import { useCustomMutation, useInvalidate } from "@refinedev/core";
import type { PwaNotification } from "@/hooks/useMyNotifications";
import type { ApprovalAction } from "@/lib/notifications";

export type Outcome = "approved" | "rejected";

interface Options {
  /** Called after any successful change so the caller can reload its list/counts. */
  onChanged: () => void;
  /** Called when a notification was marked read, so a local copy of the list can follow. */
  onRead?: (name: string) => void;
}

/**
 * Read / approve / reject for PWA notifications, shared by the page and the bell.
 * Approve/reject is optimistic: `outcomes` flips immediately and is rolled back (with `errors`) on failure.
 */
export function useNotificationActions({ onChanged, onRead }: Options) {
  const { mutateAsync: customMutation } = useCustomMutation();
  const invalidate = useInvalidate();
  const [processingId, setProcessingId] = useState<string | null>(null);
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
    setProcessingId(notif.name);
    setError(notif.name, null);
    try {
      await post(readUrl(notif.name));
      onRead?.(notif.name);
      onChanged();
      return true;
    } catch (err) {
      console.error("notification_read_failed", { name: notif.name, err });
      setError(notif.name, "Could not mark as read. Try again.");
      return false;
    } finally {
      setProcessingId(null);
    }
  }

  async function decide(notif: PwaNotification, action: ApprovalAction): Promise<void> {
    const outcome: Outcome = action === "approve" ? "approved" : "rejected";
    setProcessingId(notif.name);
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
      onChanged();
    } catch (err) {
      console.error("notification_decision_failed", { name: notif.name, action, err });
      setOutcomes((prev) => {
        const next = { ...prev };
        delete next[notif.name];
        return next;
      });
      setError(notif.name, `Could not ${action} this request. Nothing was changed, try again.`);
    } finally {
      setProcessingId(null);
    }
  }

  return { processingId, outcomes, errors, markRead, decide };
}
