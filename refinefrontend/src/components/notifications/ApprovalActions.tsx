import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Outcome } from "@/hooks/useNotificationActions";
import type { ApprovalAction } from "@/lib/notifications";
import { RejectReasonForm } from "./RejectReasonForm";

interface Props {
  outcome?: Outcome;
  processing: boolean;
  compact?: boolean;
  /** Ask for a reason before rejecting (expenses): Reject opens a small form and the reason is passed to onDecide. */
  requireReason?: boolean;
  onDecide: (action: ApprovalAction, reason?: string) => void;
}

/** Approve / Reject pair; once decided it collapses to a result badge (optimistic, rolled back by the caller on failure). */
export function ApprovalActions({ outcome, processing, compact, requireReason, onDecide }: Props) {
  const [asking, setAsking] = useState(false);
  const approved = outcome === "approved";
  const size = compact ? "sm" : "default";
  // The live region stays mounted so screen readers announce the result when it appears
  return (
    <div>
      <span aria-live="polite" className="sr-only">
        {outcome ? (approved ? "Approved" : "Rejected") : ""}
      </span>
      {outcome ? (
        <Badge aria-hidden variant={approved ? "success" : "destructive"} className={cn(processing && "opacity-70")}>
          {approved ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
          {approved ? "Approved" : "Rejected"}
        </Badge>
      ) : asking ? (
        <RejectReasonForm
          compact={compact}
          busy={processing}
          onCancel={() => setAsking(false)}
          onConfirm={(reason) => { setAsking(false); onDecide("reject", reason); }}
        />
      ) : (
        <div className="flex w-full gap-2">
          <Button
            variant="success"
            size={size}
            className="flex-1 md:flex-none"
            disabled={processing}
            onClick={() => onDecide("approve")}
          >
            <Check aria-hidden />
            Approve
          </Button>
          <Button
            variant="outline"
            size={size}
            className="flex-1 border-destructive/30 md:flex-none text-destructive hover:bg-danger-soft hover:text-danger-soft-foreground"
            disabled={processing}
            onClick={() => (requireReason ? setAsking(true) : onDecide("reject"))}
          >
            <X aria-hidden />
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}
