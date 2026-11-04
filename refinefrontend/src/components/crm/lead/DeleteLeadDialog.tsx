import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Confirmation before the lead is deleted. Stays open with an error if the delete fails. */
export function DeleteLeadDialog({ open, onOpenChange, name, emails, activities, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  emails: number;
  activities: number;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      console.error("DeleteLeadDialog: deleting the lead failed", err);
      setError("The lead was not deleted. Try again.");
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!deleting) { setError(null); onOpenChange(v); } }}>
      <DialogContent className="max-w-[420px]" role="alertdialog">
        <DialogHeader>
          <DialogTitle>Delete {name}?</DialogTitle>
          <DialogDescription className="text-[15px] leading-[22px]">
            This deletes the lead ({emails} {emails === 1 ? "email" : "emails"} and {activities} activity {activities === 1 ? "entry" : "entries"} are linked to it). It can't be undone.
          </DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">{error}</p>}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>Cancel</Button>
          <Button variant="destructive" onClick={confirm} disabled={deleting}>{deleting ? "Deleting..." : "Delete lead"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
