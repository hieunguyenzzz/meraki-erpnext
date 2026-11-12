import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** One confirm step before any payroll write. The dialog stays open while the call runs, so a second tap does nothing. */
export function ConfirmActionDialog({ open, title, text, confirmLabel, busy, onConfirm, onCancel }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{text}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="max-sm:gap-2">
          <Button variant="outline" className="max-md:h-12" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button className="max-md:h-12" onClick={onConfirm} disabled={busy}>{busy ? "Working..." : confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
