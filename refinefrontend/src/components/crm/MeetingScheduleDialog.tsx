import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface MeetingScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  onConfirm: (datetime: string, subject: string) => void;
  onCancel: () => void;
  error?: string | null;
  onErrorDismiss?: () => void;
}

export function MeetingScheduleDialog({
  open,
  onOpenChange,
  itemName,
  onConfirm,
  onCancel,
  error,
  onErrorDismiss,
}: MeetingScheduleDialogProps) {
  const [datetime, setDatetime] = useState("");
  const [subject, setSubject] = useState("");

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      // Default to tomorrow at 10:00
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);
      setDatetime(tomorrow.toISOString().slice(0, 16));
      setSubject(`Meeting with ${itemName}`);
    }
  }, [open, itemName]);

  function handleConfirm() {
    if (datetime) {
      onConfirm(datetime, subject);
    }
  }

  function handleCancel() {
    onOpenChange(false);
    onCancel();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Schedule Meeting</DialogTitle>
          <DialogDescription>
            Set the meeting date and time for {itemName}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
            {onErrorDismiss && (
              <button className="ml-2 underline text-xs" onClick={onErrorDismiss}>
                dismiss
              </button>
            )}
          </div>
        )}
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="meeting-datetime">Date & Time</Label>
            <Input
              id="meeting-datetime"
              type="datetime-local"
              value={datetime}
              onChange={(e) => setDatetime(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="meeting-subject">Subject <span className="text-destructive">*</span></Label>
            <Input
              id="meeting-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Meeting subject"
              className="w-full"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!datetime || !subject.trim()}>
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
