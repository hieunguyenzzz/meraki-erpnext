import { useState } from "react";
import { useCreate, useInvalidate, useList } from "@refinedev/core";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const EMPTY = { lead_name: "", email_id: "", phone: "", source: "" };

/** New-lead form: couple name, email, phone, source. Creates the Lead and opens it. */
export function CreateLeadSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { mutateAsync: createLead } = useCreate();
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { result: sourcesResult } = useList({
    resource: "Lead Source",
    pagination: { mode: "off" as const },
    meta: { fields: ["name"] },
  });
  const sources = (sourcesResult?.data ?? []).map((s) => String(s.name));

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.lead_name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await createLead({
        resource: "Lead",
        values: {
          lead_name: form.lead_name.trim(),
          email_id: form.email_id.trim() || undefined,
          phone: form.phone.trim() || undefined,
          source: form.source || undefined,
          status: "Lead",
        },
      });
      onOpenChange(false);
      setForm(EMPTY);
      invalidate({ resource: "Lead", invalidates: ["list"] });
      if (result?.data?.name) navigate(`/crm/leads/${result.data.name}`);
    } catch (err) {
      console.error("CreateLeadSheet: creating the lead failed", err);
      setError("The lead was not created. Check the details and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b px-6 py-4">
          <SheetTitle className="font-display text-2xl">New lead</SheetTitle>
          <p className="text-sm text-muted-foreground">Add a couple to the pipeline.</p>
        </SheetHeader>
        <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="lead_name">Couple name *</Label>
              <Input id="lead_name" placeholder="e.g. Mai & Khoa" value={form.lead_name} onChange={set("lead_name")} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email_id">Email</Label>
              <Input id="email_id" type="email" placeholder="email@example.com" value={form.email_id} onChange={set("email_id")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" type="tel" placeholder="+84 90 123 4567" value={form.phone} onChange={set("phone")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="source">Source</Label>
              <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                <SelectTrigger id="source"><SelectValue placeholder="Select source" /></SelectTrigger>
                <SelectContent>
                  {sources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">{error}</p>}
          </div>
          <SheetFooter className="shrink-0 gap-2 border-t px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting || !form.lead_name.trim()}>{submitting ? "Creating..." : "Create lead"}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
