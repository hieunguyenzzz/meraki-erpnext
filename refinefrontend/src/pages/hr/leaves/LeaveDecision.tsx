import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApprovalActions } from "@/components/notifications/ApprovalActions";
import { canDecide, type LeaveApp } from "./types";

interface Props {
  app: LeaveApp;
  processingId: string | null;
  compact?: boolean;
  onDecide: (name: string, verb: "approve" | "reject" | "re-approve") => void;
}

/** Approve / Reject for open applications, a single Approve (re-approve) for rejected ones. */
export function LeaveDecision({ app, processingId, compact, onDecide }: Props) {
  const mode = canDecide(app);
  const processing = processingId === app.name;
  if (mode === "decide") {
    return <ApprovalActions processing={processing} compact={compact} onDecide={(a) => onDecide(app.name, a)} />;
  }
  if (mode === "reapprove") {
    return (
      <Button variant="outline" size={compact ? "sm" : "default"} disabled={processing} onClick={() => onDecide(app.name, "re-approve")}>
        <Check aria-hidden />
        {processing ? "Processing..." : "Approve"}
      </Button>
    );
  }
  return null;
}
