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
  compactMessage,
  contextLine,
  detailFacts,
  factStrip,
  type NotificationDetails,
  isoDay,
  metaForType,
  stateNote,
  titleParts,
  type ApprovalAction,
} from "@/lib/notifications";
import { todayVN } from "@/lib/businessTime";
import { ApprovalActions } from "./ApprovalActions";

interface Props {
  notif: PwaNotification;
  /** Dense variant for the bell dropdown (no day headings, so older items show their date). */
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
  const time = clockTime(notif.creation);
  const when = compact && isoDay(notif.creation) !== todayVN() ? `${isoDay(notif.creation)} ${time}` : time;
  // A request someone already handled (or deleted) must not look like an unanswered one
  const note = outcome ? null : stateNote(details);
  const showActions = (actionable && !note) || !!outcome;
  const context = contextLine(details, compact);
  // The bell shows the decisive line in its meta row; the page shows it as a pill under the facts
  const metaText = compact && context ? `${when} · ${context.text}` : `${meta.label} · ${when}`;

  return (
    <article className="group relative bg-card" aria-label={`${meta.label} notification`}>
      <div className={cn("flex items-start", compact ? "gap-3 px-4 py-3" : "gap-3 px-4 py-3.5 md:gap-3.5 md:px-[18px] md:py-4")}>
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

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onOpen(notif)}
            disabled={!openable && !unread}
            className={cn(
              "block w-full min-w-0 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              openable || unread ? "cursor-pointer" : "cursor-default",
            )}
          >
            <span className={cn("block break-words", compact ? "text-sm leading-5" : "text-[15px] leading-[21px] md:leading-[22px]", !unread && "text-foreground/80")}>
              {(compact ? compactMessage(notif, details) : titleParts(notif, details)).map((part, i) =>
                part.bold ? <b key={i} className="font-semibold">{part.text}</b> : <span key={i}>{part.text}</span>,
              )}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{metaText}</span>
          </button>

          {!compact && details && factStrip(details).length > 0 && (
            <>
              <dl className="mt-2.5 hidden grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2.5 rounded-xl bg-muted px-3 py-2.5 text-[13px] md:grid">
                {factStrip(details).map((f) => (
                  <div key={f.label} className="min-w-0">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">{f.label}</dt>
                    <dd className="break-words">{f.value}</dd>
                  </div>
                ))}
              </dl>
              <span className="mt-1.5 flex flex-wrap gap-1.5 md:hidden">
                {detailFacts(details).map((fact) => (
                  <Badge key={fact} variant="secondary" className="font-medium">
                    {fact}
                  </Badge>
                ))}
              </span>
            </>
          )}

          {!compact && !note && context && (
            <p
              className={cn(
                "mt-1.5 rounded-[10px] px-2.5 py-1 text-xs md:mt-2 md:text-[13px]",
                context.tone === "success"
                  ? "inline-flex bg-success-soft font-semibold text-success-soft-foreground"
                  : "bg-muted font-medium text-foreground/80",
                context.tone === "muted" && "md:inline-flex",
              )}
            >
              {context.text}
            </p>
          )}

          {note && (
            <Badge variant={note.variant} className={compact ? "mt-2" : "mt-3"}>
              {note.label}
            </Badge>
          )}

          {(showActions || error) && (
            <div className={cn("space-y-2", compact ? "mt-2" : "mt-3")}>
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
        </div>

        {unread && (
          <div className="flex shrink-0 items-center gap-1 pt-1">
            <span className="h-[9px] w-[9px] rounded-full bg-primary-fill" role="img" aria-label="Unread" />
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 max-md:h-8 max-md:w-8",
                // On phones the row itself marks read when it opens a record; only show Dismiss where it can't
                !compact && openable && "max-md:hidden",
              )}
              disabled={processing}
              onClick={() => onDismiss(notif)}
              aria-label="Mark as read"
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}
