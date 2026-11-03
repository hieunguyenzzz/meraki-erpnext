import { useState } from "react";
import { CheckCircle, Copy, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { extractErrorMessage } from "@/lib/errors";
import { StaffSheet } from "./StaffSheet";

interface Props {
  onClose: () => void;
  onInvited: () => void;
}

const today = () => new Date().toISOString().split("T")[0];

/** Creates an employee + user account (POST /staff/invite) and shows the one-time password. */
export function InviteSheet({ onClose, onInvited }: Props) {
  const [form, setForm] = useState({ email: "", fullName: "", gender: "Female", dateOfBirth: "2000-01-01", dateOfJoining: today() });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ password: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const dirty = !success && (form.email.trim() !== "" || form.fullName.trim() !== "");

  async function handleInvite() {
    if (!form.email.trim() || !form.fullName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const resp = await fetch("/inquiry-api/staff/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: form.fullName.trim(),
          email: form.email.trim(),
          gender: form.gender,
          date_of_birth: form.dateOfBirth,
          date_of_joining: form.dateOfJoining,
        }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        const detail = errData.detail;
        const msg = Array.isArray(detail)
          ? detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join(", ")
          : detail || `Failed to invite staff (${resp.status})`;
        throw new Error(msg);
      }
      const result = await resp.json();
      onInvited();
      setSuccess({ password: result.password, name: form.fullName.trim() });
    } catch (err) {
      console.error("Invite staff failed", err);
      setError(extractErrorMessage(err, "Failed to invite staff member"));
    } finally {
      setSubmitting(false);
    }
  }

  function copyPassword() {
    if (!success?.password) return;
    void navigator.clipboard.writeText(success.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const set = (patch: Partial<typeof form>) => setForm((p) => ({ ...p, ...patch }));

  return (
    <StaffSheet
      open
      wide
      dirty={dirty}
      onClose={onClose}
      title="Invite Staff"
      subtitle="Create a new employee account. They'll complete their profile on first login."
      footer={
        success ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button onClick={handleInvite} disabled={submitting || !form.email.trim() || !form.fullName.trim()}>
              {submitting ? "Creating..." : "Create Account"}
            </Button>
          </>
        )
      }
    >
      {success ? (
        <div className="space-y-3 rounded-lg border border-success/30 bg-success-soft p-4">
          <div className="flex items-center gap-2 text-success-soft-foreground">
            <CheckCircle className="h-5 w-5" />
            <p className="font-medium">{success.name} has been added</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Share these login credentials:</p>
            <div className="flex items-center gap-2 rounded border bg-card px-3 py-2">
              <code className="flex-1 font-mono text-sm">{success.password}</code>
              <Button size="icon" variant="ghost" className="h-9 w-9" onClick={copyPassword} aria-label="Copy password">
                {copied ? <CheckCheck className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email <span className="text-destructive">*</span></Label>
            <Input id="invite-email" type="email" placeholder="staff@example.com" value={form.email} onChange={(e) => set({ email: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-name">Full Name <span className="text-destructive">*</span></Label>
            <Input id="invite-name" placeholder="e.g. Nguyen Thi Mai" value={form.fullName} onChange={(e) => set({ fullName: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="invite-gender">Gender <span className="text-destructive">*</span></Label>
              <Select value={form.gender} onValueChange={(v) => set({ gender: v })}>
                <SelectTrigger id="invite-gender"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-dob">Date of Birth <span className="text-destructive">*</span></Label>
              <Input id="invite-dob" type="date" value={form.dateOfBirth} onChange={(e) => set({ dateOfBirth: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-doj">Date of Joining</Label>
            <Input id="invite-doj" type="date" value={form.dateOfJoining} onChange={(e) => set({ dateOfJoining: e.target.value })} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </>
      )}
    </StaffSheet>
  );
}
