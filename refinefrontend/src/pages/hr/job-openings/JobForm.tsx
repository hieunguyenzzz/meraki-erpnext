import { useEffect, useMemo, useRef, useState } from "react";
import { useCreate, useInvalidate, useList, useUpdate } from "@refinedev/core";
import { extractErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SheetFooter } from "@/components/ui/sheet";
import { CreatableCombobox } from "./CreatableCombobox";
import { INITIAL_FORM, type JobOpening, type PositionForm } from "./types";

interface Props {
  /** The opening being edited; null creates a new one */
  job: JobOpening | null;
  onClose: () => void;
  /** Inside a bottom sheet: scrolling body and bordered footer. Otherwise the inline desktop panel. */
  sheet?: boolean;
  /** Reports whether a save is in flight, so the frame can refuse to close and lose a failed save */
  onBusyChange?: (busy: boolean) => void;
}

/** Fields and save logic for creating or editing a job opening; the caller supplies the frame. */
export function JobForm({ job, onClose, sheet, onBusyChange }: Props) {
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

  useEffect(() => {
    onBusyChange?.(submitting);
    return () => onBusyChange?.(false);
  }, [submitting, onBusyChange]);

  // Prefill when the form opens or switches to another opening
  useEffect(() => {
    setFormError("");
    setForm(job
      ? { designation: job.designation ?? "", location: job.location ?? "", closes_on: job.closes_on ?? "", description: job.description ?? "" }
      : INITIAL_FORM);
  }, [job]);

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

  const Footer = sheet ? SheetFooter : "div";
  return (
    <form onSubmit={(e) => void handleSubmit(e)} className={sheet ? "flex flex-1 flex-col overflow-hidden" : "flex flex-col gap-3.5"}>
      <div className={sheet ? "flex-1 space-y-4 overflow-y-auto px-5 py-4 md:px-6" : "flex flex-col gap-3.5"}>
        <CreatableCombobox
          label="Title"
          required
          value={form.designation}
          placeholder="Select title..."
          searchPlaceholder="Search titles..."
          emptyText="No titles found."
          options={designations}
          creating={creatingDesignation}
          onSelect={(d) => setForm((f) => ({ ...f, designation: d }))}
          onCreate={handleCreateDesignation}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <div className="space-y-1.5">
            <Label htmlFor="closes_on">Closing date</Label>
            <Input id="closes_on" type="date" value={form.closes_on} onChange={(e) => setForm((f) => ({ ...f, closes_on: e.target.value }))} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Role overview, responsibilities..." rows={7} />
        </div>

        {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
      </div>

      <Footer className={sheet ? "gap-2 border-t px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6 md:pb-4" : "flex gap-2"}>
        <Button type="button" variant="outline" className={sheet ? undefined : "flex-1"} onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button type="submit" className={sheet ? undefined : "flex-[2]"} disabled={submitting}>
          {submitting ? "Saving..." : job ? "Save changes" : "Create job opening"}
        </Button>
      </Footer>
    </form>
  );
}
