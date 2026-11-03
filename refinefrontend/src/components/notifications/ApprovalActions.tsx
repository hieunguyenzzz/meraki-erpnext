import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Outcome } from "@/hooks/useNotificationActions";
import type { ApprovalAction } from "@/lib/notifications";

interface Props {
  outcome?: Outcome;
  processing: boolean;
  compact?: boolean;
  onDecide: (action: ApprovalAction) => void;
}

/** Approve / Reject pair; once decided it collapses to a result badge (optimistic, rolled back by the caller on failure). */
export function ApprovalActions({ outcome, processing, compact, onDecide }: Props) {
  if (outcome) {
    const approved = outcome === "approved";
    return (
      <Badge variant={approved ? "success" : "destructive"} role="status" className={cn(processing && "opacity-70")}>
        {approved ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
        {approved ? "Approved" : "Rejected"}
      </Badge>
    );
  }

  const size = compact ? "sm" : "default";
  return (
    <div className="flex w-full gap-2">
      <Button
        variant="success"
        size={size}
        className="flex-1"
        disabled={processing}
        onClick={() => onDecide("approve")}
      >
        <Check aria-hidden />
        Approve
      </Button>
      <Button
        variant="outline"
        size={size}
        className="flex-1 border-destructive/30 text-destructive hover:bg-danger-soft hover:text-danger-soft-foreground"
        disabled={processing}
        onClick={() => onDecide("reject")}
      >
        <X aria-hidden />
        Reject
      </Button>
    </div>
  );
}
