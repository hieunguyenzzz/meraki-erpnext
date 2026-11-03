import { useEffect, useMemo, useRef, useState } from "react";
import { useCreate, useInvalidate, useList, useUpdate } from "@refinedev/core";
import { Briefcase } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { extractErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CreatableCombobox } from "./CreatableCombobox";
import { INITIAL_FORM, type JobOpening, type PositionForm } from "./types";

interface Props {
  open: boolean;
  /** The opening being edited; null creates a new one */
  job: JobOpening | null;
  onClose: () => void;
}

/** Create / edit a position. Bottom sheet on phones, side sheet on desktop. */
export function JobSheet({ open, job, onClose }: Props) {
  const desktop = useMediaQuery("(min-width: 768px)");
  const invalidate = useInvalidate();
  const { mutateAsync: createJob } = useCreate();
  const { mutateAsync: updateJob } = useUpdate();

  const [form, setForm] = useState<PositionForm>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [formError, setFormError] = useState("");
  const [creatingLocation, setCreatingLocation] = useState(false);
  const [creatingDesignation, setCreatingDesignation] = useState(false);

  // Existing branches and designations for the comboboxes
  const { result: locationsResult, query: locationsQuery } = useList({ resource: "Branch", pagination: { mode: "off" }, meta: { fields: ["name"] } });
  const { result: designationsResult, query: designationsQuery } = useList({ resource: "Designation", pagination: { mode: "off" }, meta: { fields: ["name"] } });
  const branches = useMemo(() => ((locationsResult?.data ?? []) as { name: string }[]).map((b) => b.name), [locationsResult]);
  const designations = useMemo(() => ((designationsResult?.data ?? []) as { name: string }[]).map((d) => d.name), [designationsResult]);

  // Prefill when the sheet opens
  useEffect(() => {
    if (!open) return;
    setFormError("");
    setForm(job
      ? { designation: job.designation ?? "", location: job.location ?? "", closes_on: job.closes_on ?? "", description: job.description ?? "" }
      : INITIAL_FORM);
  }, [open, job]);

  async function createLinked(doctype: "Branch" | "Designation", field: "branch" | "designation_name", name: string): Promise<string | null> {
    try {
      const resp = await fetch(`/api/resource/${doctype}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Frappe-Site-Name": "erp.merakiwp.com" },
        credentials: "include",
        body: JSON.stringify({ [field]: name }),
      });
      if (!resp.ok) throw new Error(`Failed to create ${doctype.toLowerCase()} (${resp.status})`);
      const created = await resp.json();
      return created?.data?.name ?? name;
    } catch (err) {
      console.error(`Create ${doctype} failed`, err);
      setFormError(`Failed to create ${doctype.toLowerCase()}.`);
      return null;
    }
  }

  async function handleCreateLocation(name: string): Promise<boolean> {
    setCreatingLocation(true);
    const created = await createLinked("Branch", "branch", name);
    setCreatingLocation(false);
    if (!created) return false;
    setForm((f) => ({ ...f, location: created }));
    void locationsQuery.refetch();
    return true;
  }

  async function handleCreateDesignation(name: string): Promise<boolean> {
    setCreatingDesignation(true);
    const created = await createLinked("Designation", "designation_name", name);
    setCreatingDesignation(false);
    if (!created) return false;
    setForm((f) => ({ ...f, designation: created }));
    void designationsQuery.refetch();
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!form.designation.trim()) {
      setFormError("Designation is required.");
      return;
    }
    setFormError("");
    submittingRef.current = true;
    setSubmitting(true);

    const base = { job_title: form.designation.trim(), designation: form.designation.trim() };
    // Create omits empty optional fields; edit always sends them so they can be cleared
    const optional = {
      location: form.location.trim(),
      closes_on: form.closes_on || null,
      description: form.description.trim(),
    };

    try {
      if (job) {
        await updateJob({ resource: "Job Opening", id: job.name, values: { ...base, ...optional } });
      } else {
        await createJob({ resource: "Job Opening", values: {
            ...base,
            ...(optional.location && { location: optional.location }),
            ...(optional.closes_on && { closes_on: optional.closes_on }),
            ...(optional.description && { description: optional.description }),
            status: "Open",
          } });
      }
      invalidate({ resource: "Job Opening", invalidates: ["list"] });
      onClose();
    } catch (err: unknown) {
      console.error("Save job opening failed", err);
      setFormError(extractErrorMessage(err, "Failed to save job opening."));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o && !submittingRef.current) onClose(); }}>
      <SheetContent
        side={desktop ? "right" : "bottom"}
        className="flex max-h-[92dvh] flex-col p-0 md:max-h-none md:sm:max-w-lg"
      >
        <SheetHeader className="border-b px-5 pb-4 pt-5 md:px-6 md:pt-6">
          <SheetTitle className="flex items-center gap-2 text-xl">
            <Briefcase className="h-5 w-5" aria-hidden />
            {job ? "Edit position" : "New position"}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 md:px-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <CreatableCombobox
                label="Designation"
                required
                value={form.designation}
                placeholder="Select designation..."
                searchPlaceholder="Search designations..."
                emptyText="No designations found."
                options={designations}
                creating={creatingDesignation}
                onSelect={(d) => setForm((f) => ({ ...f, designation: d }))}
                onCreate={handleCreateDesignation}
              />
              <CreatableCombobox
                label="Location"
                value={form.location}
                placeholder="Select location..."
                searchPlaceholder="Search locations..."
                emptyText="No branches found."
                options={branches}
                creating={creatingLocation}
                onSelect={(l) => setForm((f) => ({ ...f, location: l }))}
                onClear={() => setForm((f) => ({ ...f, location: "" }))}
                onCreate={handleCreateLocation}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="closes_on">Closes on</Label>
              <Input id="closes_on" type="date" value={form.closes_on} onChange={(e) => setForm((f) => ({ ...f, closes_on: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Role overview, responsibilities..." rows={5} />
            </div>

            {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          </div>

          <SheetFooter className="gap-2 border-t px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6 md:pb-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : job ? "Save changes" : "Create position"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
