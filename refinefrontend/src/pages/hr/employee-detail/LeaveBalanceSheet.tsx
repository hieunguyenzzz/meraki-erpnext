import { useRef, useState } from "react";
import { useCustomMutation } from "@refinedev/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StaffSheet } from "../staff-overview/StaffSheet";

interface Props {
  alloc: { name: string; allocated: number; taken: number };
  employeeName: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Edit one Leave Allocation's annual entitlement (new_leaves_allocated; total_leaves_allocated is computed by ERPNext). */
export function LeaveBalanceSheet({ alloc, employeeName, onClose, onSaved }: Props) {
  const { mutateAsync: customMutation } = useCustomMutation();
  const [allocated, setAllocated] = useState(alloc.allocated);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const close = () => { if (!busy.current) onClose(); };

  async function save() {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      await customMutation({
        url: "/api/method/frappe.client.set_value",
        method: "post",
        values: { doctype: "Leave Allocation", name: alloc.name, fieldname: "new_leaves_allocated", value: allocated },
      });
      onSaved();
      onClose();
    } catch (err) {
      console.error("Leave allocation update failed", alloc.name, err);
      setError(err instanceof Error && err.message ? err.message : "Failed to update leave allocation");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <StaffSheet
      open
      dirty={allocated !== alloc.allocated}
      onClose={close}
      title="Edit Leave Balance"
      subtitle={employeeName}
      footer={(requestClose) => (
        <>
          <Button variant="outline" onClick={requestClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </>
      )}
    >
      <div className="space-y-2">
        <Label htmlFor="leave-allocated">Allocated Days</Label>
        <Input
          id="leave-allocated"
          type="number"
          min={0}
          step={0.5}
          value={allocated}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) setAllocated(v);
          }}
          disabled={saving}
        />
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Taken Days</span>
        <span className="tabular-nums">{alloc.taken}</span>
      </div>
      <div className="flex justify-between text-sm font-medium">
        <span>Remaining</span>
        <span className="tabular-nums">{allocated - alloc.taken}</span>
      </div>
      {error && <p role="alert" className="text-sm text-danger-soft-foreground">{error}</p>}
    </StaffSheet>
  );
}
