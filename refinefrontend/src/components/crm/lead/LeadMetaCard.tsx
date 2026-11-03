import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ReadOnlyField } from "@/components/crm/ReadOnlyField";
import { InfoCard } from "./InfoCard";

/** Created / ID / status, and the delete action with its confirmation sheet. */
export function LeadMetaCard({ created, id, status, onDelete }: {
  created: string; id: string; status: string; onDelete: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
    } catch (err) {
      console.error("LeadMetaCard: deleting the lead failed", err);
      setError("The lead was not deleted. Try again.");
      setDeleting(false);
    }
  }

  return (
    <InfoCard title="Meta">
      <ReadOnlyField label="Created" value={created.slice(0, 10)} />
      <ReadOnlyField label="Status" value={status} />
      <ReadOnlyField label="ID" value={id} />
      <div className="border-t pt-2">
        <Button variant="ghost" size="sm" className="h-10 w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive max-md:h-12" onClick={() => setOpen(true)}>
          <Trash2 aria-hidden /> Delete lead
        </Button>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-sm">
          <SheetHeader className="shrink-0 border-b px-6 py-4">
            <SheetTitle>Delete lead</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 px-6 py-4">
            <SheetDescription>Are you sure you want to delete this lead? This action cannot be undone.</SheetDescription>
            {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">{error}</p>}
          </div>
          <SheetFooter className="shrink-0 gap-2 border-t px-6 py-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={confirm} disabled={deleting}>{deleting ? "Deleting..." : "Delete"}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </InfoCard>
  );
}
