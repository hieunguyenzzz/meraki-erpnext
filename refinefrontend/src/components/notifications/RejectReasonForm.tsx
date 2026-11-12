import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { REJECT_REASON_MAX } from "@/lib/rejectReason";

interface Props {
  busy?: boolean;
  compact?: boolean;
  /** Called once with the trimmed reason; Reject stays disabled while the reason is empty. */
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

/** Small inline form that asks why an expense is being rejected. */
export function RejectReasonForm({ busy, compact, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState("");
  const sent = useRef(false);
  const trimmed = reason.trim();

  function confirm() {
    if (sent.current || !trimmed) return;
    sent.current = true;
    onConfirm(trimmed);
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm font-semibold">
        <span>
          Reason for rejecting <span className="font-normal text-muted-foreground">required</span>
        </span>
        <Textarea
          autoFocus
          value={reason}
          maxLength={REJECT_REASON_MAX}
          rows={2}
          placeholder="e.g. Please attach the delivery receipt"
          className="min-h-[60px] font-normal"
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size={compact ? "sm" : "default"}
          className="border-destructive/30 text-destructive hover:bg-danger-soft hover:text-danger-soft-foreground"
          disabled={busy || !trimmed}
          onClick={confirm}
        >
          Reject
        </Button>
        <Button variant="ghost" size={compact ? "sm" : "default"} disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
