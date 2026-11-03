import { useRef, useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RequestSheetFrame } from "@/components/RequestSheetFrame";

interface Props {
  employeeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const initialForm = { from_date: "", to_date: "", explanation: "" };

export function RequestWfhSheet({ employeeId, open, onOpenChange, onSuccess }: Props) {
  const [form, setForm] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const submitting = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function resetForm() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    submitting.current = false;
    setForm(initialForm);
    setError(null);
    setSuccess(null);
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) resetForm();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    if (!employeeId || !form.from_date || !form.to_date) {
      setError("Please fill in all required fields");
      return;
    }
    if (new Date(form.from_date) > new Date(form.to_date)) {
      setError("From date cannot be after To date");
      return;
    }

    let succeeded = false;
    submitting.current = true;
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/inquiry-api/wfh/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee: employeeId,
          from_date: form.from_date,
          to_date: form.to_date,
          explanation: form.explanation,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to submit WFH request" }));
        throw new Error(err.detail || "Failed to submit WFH request");
      }
      setSuccess("WFH request submitted successfully");
      onSuccess();

      succeeded = true;
      closeTimer.current = setTimeout(() => {
        onOpenChange(false);
        resetForm();
      }, 1500);
    } catch (err: unknown) {
      console.error("WFH request failed", err);
      setError(err instanceof Error ? err.message : "Failed to submit WFH request");
    } finally {
      // After a success the lock stays on until the sheet closes, so a late tap cannot send a duplicate
      if (!succeeded) submitting.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <RequestSheetFrame
      open={open}
      onOpenChange={handleOpenChange}
      title="Request work from home"
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel={isSubmitting ? "Submitting..." : "Submit request"}
      error={error}
      success={success}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wfh_from_date">From date *</Label>
          <Input id="wfh_from_date" type="date" className="h-12" value={form.from_date} onChange={(e) => setForm((p) => ({ ...p, from_date: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wfh_to_date">To date *</Label>
          <Input id="wfh_to_date" type="date" className="h-12" value={form.to_date} onChange={(e) => setForm((p) => ({ ...p, to_date: e.target.value }))} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wfh_explanation">Notes</Label>
        <Textarea
          id="wfh_explanation"
          value={form.explanation}
          onChange={(e) => setForm((p) => ({ ...p, explanation: e.target.value }))}
          placeholder="Optional: Add any notes or explanation"
          rows={4}
        />
      </div>
    </RequestSheetFrame>
  );
}
