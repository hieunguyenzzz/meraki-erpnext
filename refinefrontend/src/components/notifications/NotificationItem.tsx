import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PwaNotification } from "@/hooks/useMyNotifications";
import type { Outcome } from "@/hooks/useNotificationActions";
import {
  DOC_ROUTES,
  TONE_CLASSES,
  clockTime,
  detailFacts,
  type NotificationDetails,
  isoDay,
  metaForType,
  parseMessage,
  type ApprovalAction,
} from "@/lib/notifications";
import { ApprovalActions } from "./ApprovalActions";

interface Props {
  notif: PwaNotification;
  /** Dense variant for the bell dropdown (shows the date too, since there are no day headings). */
  compact?: boolean;
  /** Show Approve / Reject (the caller applies the role gating). */
  actionable: boolean;
  outcome?: Outcome;
  error?: string;
  details?: NotificationDetails;
  processing: boolean;
  onOpen: (notif: PwaNotification) => void;
  onDismiss: (notif: PwaNotification) => void;
  onDecide: (notif: PwaNotification, action: ApprovalAction) => void;
}

export function NotificationItem({
  notif,
  compact,
  actionable,
  outcome,
  error,
  details,
  processing,
  onOpen,
  onDismiss,
  onDecide,
}: Props) {
  const meta = metaForType(notif.reference_document_type);
  const Icon = meta.icon;
  const unread = !notif.read;
  const openable = !!DOC_ROUTES[notif.reference_document_type];
  const when = compact ? `${isoDay(notif.creation)} ${clockTime(notif.creation)}` : clockTime(notif.creation);
  const showActions = actionable || !!outcome;

  return (
    <article className="group relative bg-card" aria-label={`${meta.label} notification`}>
      <div className={cn("flex items-start gap-3", compact ? "px-3 py-2.5" : "px-4 py-3.5")}>
        <button
          type="button"
          onClick={() => onOpen(notif)}
          disabled={!openable && !unread}
          className={cn(
            "flex min-w-0 flex-1 items-start gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            openable || unread ? "cursor-pointer" : "cursor-default",
          )}
        >
          <span
            className={cn(
              "flex shrink-0 items-center justify-center rounded-full",
              compact ? "h-8 w-8" : "h-10 w-10",
              TONE_CLASSES[meta.tone],
            )}
            aria-hidden
          >
            <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn("block break-words", compact ? "text-sm leading-snug" : "text-[15px] leading-[21px]", !unread && "text-foreground/80")}>
              {parseMessage(notif.message).map((part, i) =>
                part.bold ? <b key={i} className="font-semibold">{part.text}</b> : <span key={i}>{part.text}</span>,
              )}
            </span>
            {details && (
              <span className="mt-1.5 flex flex-wrap gap-1.5">
                {detailFacts(details).map((fact) => (
                  <Badge key={fact} variant="secondary" className="font-medium">
                    {fact}
                  </Badge>
                ))}
              </span>
            )}
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {meta.label} · {when}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1 pt-1">
          {unread && (
            <>
              <span className="h-[9px] w-[9px] rounded-full bg-primary-fill" role="img" aria-label="Unread" />
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 w-8 max-md:h-8 max-md:w-8",
                  // Bell: always visible. Page: hover-only on desktop; on phones only where tapping the row can't mark it read.
                  !compact && "md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100",
                  !compact && openable && "max-md:hidden",
                )}
                disabled={processing}
                onClick={() => onDismiss(notif)}
                aria-label="Mark as read"
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </>
          )}
        </div>
      </div>

      {(showActions || error) && (
        <div className={cn("space-y-2 pb-3.5", compact ? "pl-14 pr-3" : "pl-[68px] pr-4")}>
          {showActions && (
            <ApprovalActions
              outcome={outcome}
              processing={processing}
              compact={compact}
              onDecide={(action) => onDecide(notif, action)}
            />
          )}
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
