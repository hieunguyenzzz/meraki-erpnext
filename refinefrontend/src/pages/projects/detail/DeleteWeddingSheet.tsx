import { useState } from "react";
import { useNavigation } from "@refinedev/core";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { InlineError } from "./InlineError";

interface Props {
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Confirm panel for deleting the wedding (cascade happens in the backend). */
export function DeleteWeddingSheet({ name, open, onOpenChange }: Props) {
  const { list } = useNavigation();
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/inquiry-api/wedding/${name}/delete`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Delete failed");
      }
      list("Project");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
  <Sheet open={open} onOpenChange={(next) => { if (!isDeleting) { onOpenChange(next); setDeleteError(null); } }}>
    <SheetContent side="right" className="sm:max-w-sm flex flex-col p-0">
      <SheetHeader className="px-6 py-4 border-b shrink-0">
        <SheetTitle>Delete Project</SheetTitle>
      </SheetHeader>
      <div className="px-6 py-4 space-y-3">
        <p className="text-sm text-muted-foreground">Are you sure you want to delete this project? This action cannot be undone.</p>
        <InlineError message={deleteError} />
      </div>
      <SheetFooter className="px-6 py-4 border-t shrink-0">
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
          {isDeleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</> : "Delete"}
        </Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
  );
}
