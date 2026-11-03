import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { displayName } from "@/lib/format";
import type { Employee } from "@/lib/types";

export function DeleteDialog({ employee, open, onOpenChange }: { employee: Employee; open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  async function submit() {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/inquiry-api/employee/${employee.name}/delete`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `API error ${res.status}`);
      }
      navigate("/hr/staff-overview");
    } catch (err) {
      console.error("Employee delete failed", employee.name, err);
      setError(err instanceof Error ? err.message : "Failed to delete employee");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {displayName(employee)}?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This will permanently delete {displayName(employee)} and their user account. This cannot be undone.
        </p>
        {error && <p role="alert" className="text-sm text-danger-soft-foreground">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button variant="destructive" onClick={submit} disabled={loading}>{loading ? "Deleting..." : "Delete permanently"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
