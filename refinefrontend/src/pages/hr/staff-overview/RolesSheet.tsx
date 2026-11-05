import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { displayName } from "@/lib/format";
import { apiErrorMessage, extractErrorMessage } from "@/lib/errors";
import { ASSIGNABLE_ROLES } from "@/lib/roles";
import { StaffSheet } from "./StaffSheet";
import type { StaffRow } from "./types";

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

interface Props {
  employee: StaffRow;
  onClose: () => void;
  onSaved: (employeeId: string, roles: string[]) => void;
}

/** Sets the employee's user roles (POST /employee/{id}/set-roles). Mount with a key per employee. */
export function RolesSheet({ employee, onClose, onSaved }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(employee.staff_roles));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  const dirty = [...selected].sort().join(",") !== [...employee.staff_roles].sort().join(",");

  function toggle(role: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }

  async function handleSave() {
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError(null);
    try {
      const roles = Array.from(selected);
      const res = await fetch(`/inquiry-api/employee/${employee.name}/set-roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles }),
      });
      if (!res.ok) {
        throw new Error(apiErrorMessage(await res.json().catch(() => ({})), `API error ${res.status}`));
      }
      onSaved(employee.name, roles);
      onClose();
    } catch (err) {
      console.error("Saving roles failed", err);
      setError(extractErrorMessage(err, "Failed to save roles"));
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <StaffSheet
      open
      dirty={dirty}
      onClose={onClose}
      title="Assign Roles"
      subtitle={displayName(employee)}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </>
      }
    >
      <div className="space-y-1">
        {ASSIGNABLE_ROLES.map((r) => (
          <label key={r.role} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-muted/50">
            <Checkbox checked={selected.has(r.role)} onCheckedChange={() => toggle(r.role)} />
            <Badge variant={r.variant as BadgeVariant}>{r.label}</Badge>
            <span className="text-sm text-muted-foreground">{r.role}</span>
          </label>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </StaffSheet>
  );
}
