import { useRef, useState } from "react";
import { useInvalidate } from "@refinedev/core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { displayName } from "@/lib/format";
import { todayVN } from "@/lib/businessTime";
import type { Employee } from "@/lib/types";

/** Deactivate (sets Left + disables login) or reactivate an employee. */
export function StatusDialog({ employee, open, onOpenChange }: { employee: Employee; open: boolean; onOpenChange: (o: boolean) => void }) {
  const invalidate = useInvalidate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relievingDate, setRelievingDate] = useState(() => todayVN());
  const busy = useRef(false);
  const active = employee.status === "Active";

  async function submit() {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    const action = active ? "deactivate" : "activate";
    const body = action === "deactivate" ? JSON.stringify({ relieving_date: relievingDate }) : undefined;
    try {
      const res = await fetch(`/inquiry-api/employee/${encodeURIComponent(employee.name)}/${action}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `API error ${res.status}`);
      }
      invalidate({ resource: "Employee", id: employee.name, invalidates: ["detail"] });
      onOpenChange(false);
    } catch (err) {
      console.error("Employee status change failed", employee.name, err);
      setError(err instanceof Error ? err.message : "Failed to update employee status");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!loading) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{active ? `Deactivate ${displayName(employee)}?` : `Reactivate ${displayName(employee)}?`}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {active
            ? `This will set their status to "Left" and disable their login account${employee.company_email ? ` (${employee.company_email})` : ""}.`
            : 'This will set their status to "Active" and re-enable their login account.'}
        </p>
        {active && (
          <div className="space-y-1">
            <Label htmlFor="relieving-date">Last working day</Label>
            <Input id="relieving-date" type="date" value={relievingDate} onChange={(e) => setRelievingDate(e.target.value)} />
          </div>
        )}
        {error && <p role="alert" className="text-sm text-danger-soft-foreground">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button variant={active ? "destructive" : "default"} onClick={submit} disabled={loading}>
            {loading ? "Saving..." : active ? "Deactivate" : "Activate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
