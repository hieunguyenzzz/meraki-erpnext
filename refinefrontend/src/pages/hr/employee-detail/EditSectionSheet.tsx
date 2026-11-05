import { useEffect, useMemo, useRef, useState } from "react";
import { useInvalidate } from "@refinedev/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ASSIGNABLE_ROLES } from "@/lib/roles";
import type { Employee } from "@/lib/types";
import { StaffSheet } from "../staff-overview/StaffSheet";
import { changedPayload, initialEditValues, type EditValues } from "./editValues";
import type { EditSection, UserOption } from "./types";

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

const TITLES: Record<EditSection, string> = {
  personal: "Edit Personal Information",
  contact: "Edit Contact",
  commission: "Edit Commission Structure",
  allowance: "Edit Allowance Rates",
  employment: "Edit Employment",
};

interface Props {
  employee: Employee;
  section: EditSection;
  users: UserOption[];
  designations: { name: string }[];
  canManageRoles: boolean;
  onClose: () => void;
}

function Field({ id, label, hint, children }: { id?: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** One edit sheet for all five Overview cards. Mounted only while a section is being edited. */
export function EditSectionSheet({ employee, section, users, designations, canManageRoles, onClose }: Props) {
  const invalidate = useInvalidate();
  const initial = useMemo(() => initialEditValues(employee, section), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [values, setValues] = useState<EditValues>(initial);
  const set = (key: string, v: string | number) => setValues((prev) => ({ ...prev, [key]: v }));
  const text = (key: string) => (values[key] ?? "") as string | number;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const [userRoles, setUserRoles] = useState<string[]>([]);
  // Roles are only written back once the current ones have loaded; otherwise an empty list would strip them all.
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [loadedRoles, setLoadedRoles] = useState<string[]>([]);
  const linkBusy = useRef(false);
  const [linkEmail, setLinkEmail] = useState(section === "contact" ? employee.user_id || "" : "");
  const [linking, setLinking] = useState(false);
  const [linkMessage, setLinkMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Current ERPNext roles of the linked user (employment section only).
  useEffect(() => {
    if (section !== "employment" || !employee.user_id) return;
    fetch(`/api/resource/User/${encodeURIComponent(employee.user_id)}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`User roles ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const current = ((data?.data?.roles ?? []) as { role: string }[]).map((r) => r.role);
        setUserRoles(current);
        setLoadedRoles(current);
        setRolesLoaded(true);
      })
      .catch((err) => {
        console.error("Could not load user roles for", employee.user_id, err);
        setError("Couldn't load roles. Other changes can still be saved; roles will not be touched.");
      });
  }, [section, employee.user_id]);

  const dirty =
    JSON.stringify(values) !== JSON.stringify(initial) ||
    (rolesLoaded && [...userRoles].sort().join("|") !== [...loadedRoles].sort().join("|"));
  // A save in flight must not be dismissed: the user would not see whether it worked.
  const close = () => { if (!busy.current) onClose(); };

  async function handleSave() {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      // Send only what the user changed; a stale snapshot must not overwrite fields they never touched.
      const changes = changedPayload(initial, values);
      if (Object.keys(changes).length > 0) {
        const res = await fetch(`/inquiry-api/employee/${encodeURIComponent(employee.name)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ values: changes }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || `API error ${res.status}`);
        }
      }
      // Roles are saved on the linked ERPNext user, only by System Manager / Administrator.
      if (section === "employment" && employee.user_id && canManageRoles && rolesLoaded) {
        const rolesRes = await fetch(`/inquiry-api/employee/${encodeURIComponent(employee.name)}/set-roles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roles: userRoles }),
        });
        if (!rolesRes.ok) {
          const data = await rolesRes.json().catch(() => ({}));
          throw new Error(data.detail || `Failed to save roles (${rolesRes.status})`);
        }
      }
      invalidate({ resource: "Employee", id: employee.name, invalidates: ["detail"] });
      onClose();
    } catch (err) {
      console.error("Employee save failed", employee.name, section, err);
      setError(err instanceof Error && err.message ? err.message : "Failed to save");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  async function handleLinkUser() {
    if (!linkEmail.trim() || linkBusy.current) return;
    linkBusy.current = true;
    setLinking(true);
    setLinkMessage(null);
    try {
      const res = await fetch(`/inquiry-api/employee/${encodeURIComponent(employee.name)}/link-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: linkEmail.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || `API error ${res.status}`);
      setLinkMessage({ type: "success", text: data.created ? "User created and linked" : "User linked" });
      set("company_email", linkEmail.trim());
      invalidate({ resource: "Employee", id: employee.name, invalidates: ["detail"] });
    } catch (err) {
      console.error("Link user failed", employee.name, err);
      setLinkMessage({ type: "error", text: err instanceof Error && err.message ? err.message : "Failed to link user" });
    } finally {
      linkBusy.current = false;
      setLinking(false);
    }
  }

  const num = (id: string, label: string, key: string, extra: React.ComponentProps<typeof Input> = {}) => (
    <Field id={id} label={label}>
      <Input id={id} type="number" value={text(key)} onChange={(e) => set(key, e.target.value)} {...extra} />
    </Field>
  );

  return (
    <StaffSheet
      open
      dirty={dirty}
      onClose={close}
      title={TITLES[section]}
      subtitle={employee.employee_name}
      footer={(requestClose) => (
        <>
          <Button variant="outline" onClick={requestClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </>
      )}
    >
      {section === "personal" && (
        <>
          <Field id="edit-first-name" label="First Name">
            <Input id="edit-first-name" value={text("first_name")} onChange={(e) => set("first_name", e.target.value)} />
          </Field>
          <Field id="edit-last-name" label="Last Name">
            <Input id="edit-last-name" value={text("last_name")} onChange={(e) => set("last_name", e.target.value)} />
          </Field>
          <Field label="Gender">
            <Select value={values.gender as string} onValueChange={(v) => set("gender", v)}>
              <SelectTrigger aria-label="Gender"><SelectValue placeholder="Select gender" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Male">Male</SelectItem>
                <SelectItem value="Female">Female</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field id="edit-dob" label="Date of Birth">
            <Input id="edit-dob" type="date" value={text("date_of_birth")} onChange={(e) => set("date_of_birth", e.target.value)} />
          </Field>
        </>
      )}

      {section === "contact" && (
        <Field id="edit-link-user" label="Linked User">
          <div className="flex gap-2">
            <Input
              id="edit-link-user"
              type="email"
              value={linkEmail}
              onChange={(e) => { setLinkEmail(e.target.value); setLinkMessage(null); }}
              placeholder="Enter email to link or create user"
            />
            <Button type="button" variant="outline" disabled={linking || !linkEmail.trim()} onClick={handleLinkUser}>
              {linking ? "Linking…" : "Link"}
            </Button>
          </div>
          {linkMessage && (
            <p role={linkMessage.type === "error" ? "alert" : "status"} className={`text-sm ${linkMessage.type === "success" ? "text-success-soft-foreground" : "text-danger-soft-foreground"}`}>
              {linkMessage.text}
            </p>
          )}
        </Field>
      )}

      {section === "employment" && (
        <>
          <Field label="Designation">
            <Select
              value={(values.designation as string) || "__none__"}
              onValueChange={(v) => set("designation", v === "__none__" ? "" : v)}
            >
              <SelectTrigger aria-label="Designation"><SelectValue placeholder="Select designation" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                {designations.map((d) => (
                  <SelectItem key={d.name} value={d.name}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="edit-doj" label="Date of Joining">
            <Input id="edit-doj" type="date" value={text("date_of_joining")} onChange={(e) => set("date_of_joining", e.target.value)} />
          </Field>
          <Field id="edit-relieving-date" label="Relieving Date" hint="Last working day. Leave blank if still active.">
            <Input id="edit-relieving-date" type="date" value={text("relieving_date")} onChange={(e) => set("relieving_date", e.target.value)} />
          </Field>
          {canManageRoles && (
            <Field label="Roles">
              {employee.user_id ? (
                <div className="space-y-1" aria-busy={!rolesLoaded}>
                  {ASSIGNABLE_ROLES.map((r) => {
                    const checked = userRoles.includes(r.role);
                    return (
                      <label key={r.role} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-muted">
                        <Checkbox
                          checked={checked}
                          disabled={!rolesLoaded}
                          onCheckedChange={() => setUserRoles((prev) => (checked ? prev.filter((x) => x !== r.role) : [...prev, r.role]))}
                        />
                        <Badge variant={r.variant as BadgeVariant}>{r.label}</Badge>
                        <span className="text-sm text-muted-foreground">{r.role}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Link a user first to manage roles.</p>
              )}
            </Field>
          )}
          {num("edit-ctc", "Base Salary (VND)", "ctc")}
          {num("edit-insurance-salary", "Insurance Salary / BHXH (VND)", "custom_insurance_salary")}
          {num("edit-dependents", "Tax Dependents (PIT)", "custom_number_of_dependents", { min: "0" })}
          <Field label="Leave Approver">
            <Select value={values.leave_approver as string} onValueChange={(v) => set("leave_approver", v)}>
              <SelectTrigger aria-label="Leave approver"><SelectValue placeholder="Select approver" /></SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.name} value={u.name}>{u.full_name || u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Tax method (PIT)">
            <Select
              value={(values.custom_pit_method as string) || "__progressive__"}
              onValueChange={(v) => set("custom_pit_method", v === "__progressive__" ? "" : v)}
            >
              <SelectTrigger aria-label="Tax method"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__progressive__">Progressive (brackets)</SelectItem>
                <SelectItem value="Flat 10%">Flat 10%</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-muted">
            <Checkbox
              checked={!!values.custom_is_probation}
              onCheckedChange={() => set("custom_is_probation", values.custom_is_probation ? 0 : 1)}
            />
            <span className="text-sm font-medium">Probation (85% base salary)</span>
          </label>
          {!!values.custom_is_probation && (
            <Field id="edit-probation-end-date" label="Probation End Date">
              <Input
                id="edit-probation-end-date"
                type="date"
                value={text("custom_probation_end_date")}
                onChange={(e) => set("custom_probation_end_date", e.target.value)}
              />
            </Field>
          )}
        </>
      )}

      {section === "commission" && (
        <>
          {(["lead", "support", "assistant"] as const).map((k) =>
            num(`edit-${k}-pct`, `${k[0].toUpperCase()}${k.slice(1)} Commission (%)`, `custom_${k}_commission_pct`, { min: 0, max: 100, step: 0.1 }),
          )}
          {num("edit-full-pkg-pct", "Full Package - Sales Commission (VND)", "custom_full_package_commission_pct", { min: 0, step: 100000 })}
          {num("edit-partial-pkg-pct", "Partial Package - Sales Commission (VND)", "custom_partial_package_commission_pct", { min: 0, step: 100000 })}
        </>
      )}

      {section === "allowance" && (
        <>
          <p className="text-sm text-muted-foreground">
            Set the fixed allowance this employee receives when assigned to a wedding, based on wedding type and package.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {num("edit-hcm-full", "HCM – Full Package (VND)", "custom_allowance_hcm_full", { min: 0, step: 100000 })}
            {num("edit-hcm-partial", "HCM – Partial (VND)", "custom_allowance_hcm_partial", { min: 0, step: 100000 })}
            {num("edit-dest-full", "Destination – Full Package (VND)", "custom_allowance_dest_full", { min: 0, step: 100000 })}
            {num("edit-dest-partial", "Destination – Partial (VND)", "custom_allowance_dest_partial", { min: 0, step: 100000 })}
          </div>
        </>
      )}

      {error && <p role="alert" className="text-sm text-danger-soft-foreground">{error}</p>}
    </StaffSheet>
  );
}
