import { useRef, useState } from "react";
import { useDelete, useNavigation } from "@refinedev/core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function DeleteApplicantDialog({ id, open, onOpenChange }: { id: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { mutateAsync: deleteRecord } = useDelete();
  const { list } = useNavigation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  async function submit() {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      await deleteRecord({ resource: "Job Applicant", id });
      list("Job Applicant");
    } catch (err) {
      console.error("Applicant delete failed", id, err);
      setError(err instanceof Error ? err.message : "Failed to delete applicant");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Applicant</DialogTitle>
          <DialogDescription>Are you sure you want to delete this applicant? This action cannot be undone.</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="text-sm text-danger-soft-foreground">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button variant="destructive" onClick={submit} disabled={loading}>{loading ? "Deleting..." : "Delete"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
