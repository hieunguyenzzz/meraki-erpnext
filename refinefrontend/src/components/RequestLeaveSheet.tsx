import { useState, useEffect, useRef } from "react";
import { useList, useInvalidate } from "@refinedev/core";
import { useMyEmployee } from "@/hooks/useMyEmployee";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { RequestSheetFrame } from "@/components/RequestSheetFrame";
import { LeaveSplitSummary, type SplitPreview } from "@/components/LeaveSplitSummary";
import { cn } from "@/lib/utils";

interface RequestLeaveSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const initialForm = {
  leave_type: "",
  from_date: "",
  to_date: "",
  half_day: false,
  half_day_period: "" as "" | "AM" | "PM",
  description: "",
};

export function RequestLeaveSheet({ open, onOpenChange, onSuccess }: RequestLeaveSheetProps) {
  const { employeeId } = useMyEmployee();
  const invalidate = useInvalidate();

  const [form, setForm] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitStep, setSubmitStep] = useState<string | null>(null);
  const submitting = useRef(false);

  // Fetch leave types
  const { result: leaveTypesResult, query: leaveTypesQuery } = useList<{ name: string }>({
    resource: "Leave Type",
    pagination: { mode: "off" },
    meta: { fields: ["name"] },
  });
  const leaveTypes = ((leaveTypesResult?.data ?? []) as { name: string }[]).filter(
    (lt) => lt.name !== "Compensatory Off"
  );

  // Backend-driven split preview for Annual Leave (holiday-aware)
  const [splitPreview, setSplitPreview] = useState<SplitPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (form.leave_type !== "Annual Leave" || !form.from_date || !form.to_date || !employeeId) {
      setSplitPreview(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const params = new URLSearchParams({
          employee: employeeId,
          leave_type: form.leave_type,
          from_date: form.from_date,
          to_date: form.to_date,
        });
        const res = await fetch(`/inquiry-api/leave/preview?${params}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          setSplitPreview(await res.json());
        } else {
          console.error("Leave preview failed", res.status);
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) console.error("Leave preview failed", err);
      } finally {
        setPreviewLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [form.leave_type, form.from_date, form.to_date, employeeId]);

  function resetForm() {
    setForm(initialForm);
    setError(null);
    setSuccess(null);
    setSplitPreview(null);
    setSubmitStep(null);
  }

  function handleOpenChange(open: boolean) {
    onOpenChange(open);
    if (!open) resetForm();
  }

  async function fetchLeaveApply(payload: {
    employee: string;
    leave_type: string;
    from_date: string;
    to_date: string;
    description: string;
  }) {
    const res = await fetch("/inquiry-api/leave/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail ?? "Failed to submit leave request");
    }
    return res.json();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    if (!employeeId || !form.leave_type || !form.from_date || !form.to_date) {
      setError("Please fill in all required fields");
      return;
    }
    if (new Date(form.from_date) > new Date(form.to_date)) {
      setError("From date cannot be after To date");
      return;
    }

    submitting.current = true;
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    setSubmitStep(null);

    const basePayload = {
      employee: employeeId,
      leave_type: form.leave_type,
      from_date: form.from_date,
      to_date: form.to_date,
      description: form.description,
      half_day: form.half_day,
      half_day_period: form.half_day ? form.half_day_period : "",
    };

    try {
      if (splitPreview?.needs_split && splitPreview.casual_to_date && splitPreview.lwp_from_date) {
        setSubmitStep("Submitting Annual Leave…");
        await fetchLeaveApply({
          ...basePayload,
          leave_type: "Annual Leave",
          to_date: splitPreview.casual_to_date,
        });

        setSubmitStep("Submitting Leave Without Pay…");
        try {
          await fetchLeaveApply({
            ...basePayload,
            leave_type: "Leave Without Pay",
            from_date: splitPreview.lwp_from_date,
          });
        } catch (err: unknown) {
          console.error("Leave Without Pay portion failed", err);
          const message = err instanceof Error ? err.message : "Unknown error";
          setError(`Annual Leave was created, but the Leave Without Pay portion failed: ${message}. Please resubmit the remaining days manually.`);
          invalidate({ resource: "Leave Application", invalidates: ["list"] });
          return;
        }

        setSuccess("Both leave requests submitted successfully.");
      } else if (splitPreview?.needs_split && splitPreview.lwp_from_date && !splitPreview.casual_to_date) {
        setSubmitStep("Submitting Leave Without Pay…");
        await fetchLeaveApply({
          ...basePayload,
          leave_type: "Leave Without Pay",
        });
        setSuccess("Leave request submitted as Leave Without Pay (no Annual Leave balance remaining).");
      } else {
        await fetchLeaveApply(basePayload);
        setSuccess("Leave request submitted successfully.");
      }

      invalidate({ resource: "Leave Application", invalidates: ["list"] });
      onSuccess?.();
      setTimeout(() => {
        onOpenChange(false);
        resetForm();
      }, 1500);
    } catch (err: unknown) {
      console.error("Leave request failed", err);
      const message = err instanceof Error ? err.message : "Failed to submit leave request";
      setError(message);
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
      setSubmitStep(null);
    }
  }

  const showPreview = form.leave_type === "Annual Leave" && !!form.from_date && !!form.to_date;
  const submitLabel = isSubmitting
    ? (submitStep ?? "Submitting…")
    : splitPreview?.needs_split && splitPreview.casual_to_date
      ? "Submit both requests"
      : "Submit request";

  return (
    <RequestSheetFrame
      open={open}
      onOpenChange={handleOpenChange}
      title="Request leave"
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel={submitLabel}
      error={error}
      success={success}
    >
      <div className="flex flex-col gap-2">
        <span id="leave-type-label" className="text-sm font-medium">Leave type *</span>
        {leaveTypesQuery.isLoading ? (
          <div className="flex gap-2"><Skeleton className="h-11 w-24 rounded-full" /><Skeleton className="h-11 w-24 rounded-full" /></div>
        ) : (
          <div role="radiogroup" aria-labelledby="leave-type-label" className="flex flex-wrap gap-2">
            {leaveTypes.map((lt) => (
              <button
                key={lt.name}
                type="button"
                role="radio"
                aria-checked={form.leave_type === lt.name}
                onClick={() => setForm((prev) => ({ ...prev, leave_type: lt.name }))}
                className={cn(
                  "h-11 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  form.leave_type === lt.name ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:bg-muted",
                )}
              >
                {lt.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from_date">From date *</Label>
          <Input
            id="from_date"
            type="date"
            className="h-12"
            value={form.from_date}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                from_date: e.target.value,
                ...(prev.half_day ? { to_date: e.target.value } : {}),
              }))
            }
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to_date">To date *</Label>
          <Input
            id="to_date"
            type="date"
            className="h-12"
            value={form.to_date}
            onChange={(e) => setForm((prev) => ({ ...prev, to_date: e.target.value }))}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] font-medium">
          <Checkbox
            className="h-[22px] w-[22px]"
            checked={form.half_day}
            onCheckedChange={(v) => {
              const checked = v === true;
              setForm((prev) => ({
                ...prev,
                half_day: checked,
                half_day_period: checked ? "AM" : "",
                ...(checked && prev.from_date ? { to_date: prev.from_date } : {}),
              }));
            }}
          />
          Half day
        </label>
        {form.half_day && (
          <div role="radiogroup" aria-label="Half day period" className="flex gap-2">
            {(["AM", "PM"] as const).map((period) => (
              <button
                key={period}
                type="button"
                role="radio"
                aria-checked={form.half_day_period === period}
                onClick={() => setForm((prev) => ({ ...prev, half_day_period: period }))}
                className={cn(
                  "h-11 flex-1 rounded-full border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  form.half_day_period === period ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:bg-muted",
                )}
              >
                {period === "AM" ? "AM (morning)" : "PM (afternoon)"}
              </button>
            ))}
          </div>
        )}
      </div>

      {previewLoading && showPreview && (
        <div role="status" className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">Checking leave balance…</div>
      )}
      {!previewLoading && splitPreview && showPreview && (
        <LeaveSplitSummary preview={splitPreview} fromDate={form.from_date} toDate={form.to_date} />
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Reason</Label>
        <Textarea
          id="description"
          value={form.description}
          onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Optional: Describe the reason for your leave"
          rows={3}
        />
      </div>
    </RequestSheetFrame>
  );
}
