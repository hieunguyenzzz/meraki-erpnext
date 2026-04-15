import { useState, useEffect } from "react";
import { useList, useInvalidate } from "@refinedev/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EmployeeOption {
  name: string;
  displayName: string;
}

interface HrAddLeaveSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: EmployeeOption[];
  onSuccess?: () => void;
}

const initialForm = {
  employee: "",
  leave_type: "",
  from_date: "",
  to_date: "",
  half_day: false,
  half_day_period: "" as "" | "AM" | "PM",
  description: "",
};

export function HrAddLeaveSheet({ open, onOpenChange, employees, onSuccess }: HrAddLeaveSheetProps) {
  const invalidate = useInvalidate();

  const [form, setForm] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch leave types
  const { result: leaveTypesResult } = useList<{ name: string }>({
    resource: "Leave Type",
    pagination: { mode: "off" },
    meta: { fields: ["name"] },
  });
  const leaveTypes = ((leaveTypesResult?.data ?? []) as { name: string }[]).filter(
    (lt) => lt.name !== "Compensatory Off"
  );

  // Backend-driven split preview (Annual Leave: holidays, weekday count, balance split)
  const [splitPreview, setSplitPreview] = useState<{
    requested_days: number;
    total_weekdays: number;
    holidays_excluded: { date: string; description: string }[];
    casual_balance: number;
    needs_split: boolean;
    casual_days: number;
    lwp_days: number;
    casual_to_date: string | null;
    lwp_from_date: string | null;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (!form.employee || form.leave_type !== "Annual Leave" || !form.from_date || !form.to_date) {
      setSplitPreview(null);
      return;
    }
    if (new Date(form.from_date) > new Date(form.to_date)) {
      setSplitPreview(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const params = new URLSearchParams({
          employee: form.employee,
          leave_type: form.leave_type,
          from_date: form.from_date,
          to_date: form.to_date,
        });
        const res = await fetch(`/inquiry-api/leave/preview?${params}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          setSplitPreview(await res.json());
        }
      } catch {
        // ignore abort
      } finally {
        setPreviewLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [form.employee, form.leave_type, form.from_date, form.to_date]);

  // Past-date check (informational — HR often records historical leave)
  const isPastRange = (() => {
    if (!form.from_date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const toCompare = form.to_date || form.from_date;
    return new Date(toCompare) < today;
  })();

  function resetForm() {
    setForm(initialForm);
    setError(null);
    setSuccess(null);
    setSplitPreview(null);
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) resetForm();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.employee || !form.leave_type || !form.from_date || !form.to_date) {
      setError("Please fill in all required fields");
      return;
    }
    if (new Date(form.from_date) > new Date(form.to_date)) {
      setError("From date cannot be after To date");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/inquiry-api/leave/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee: form.employee,
          leave_type: form.leave_type,
          from_date: form.from_date,
          to_date: form.to_date,
          description: form.description,
          half_day: form.half_day,
          half_day_period: form.half_day ? form.half_day_period : "",
          auto_approve: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? "Failed to add leave");
      }

      setSuccess("Leave added and approved.");
      invalidate({ resource: "Leave Application", invalidates: ["list"] });
      invalidate({ resource: "Leave Allocation", invalidates: ["list"] });
      onSuccess?.();
      setTimeout(() => {
        onOpenChange(false);
        resetForm();
      }, 1200);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to add leave";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <SheetTitle>Add Leave (HR)</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-md border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-400">
                {success}
              </div>
            )}

            <div>
              <Label htmlFor="employee">Employee *</Label>
              <Select
                value={form.employee}
                onValueChange={(v) => setForm((prev) => ({ ...prev, employee: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.name} value={e.name}>
                      {e.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="leave_type">Leave Type *</Label>
              <Select
                value={form.leave_type}
                onValueChange={(v) => setForm((prev) => ({ ...prev, leave_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select leave type" />
                </SelectTrigger>
                <SelectContent>
                  {leaveTypes.map((lt) => (
                    <SelectItem key={lt.name} value={lt.name}>
                      {lt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="from_date">From Date *</Label>
                <Input
                  id="from_date"
                  type="date"
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
              <div>
                <Label htmlFor="to_date">To Date *</Label>
                <Input
                  id="to_date"
                  type="date"
                  value={form.to_date}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, to_date: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.half_day}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setForm((prev) => ({
                      ...prev,
                      half_day: checked,
                      half_day_period: checked ? "AM" : "",
                      ...(checked && prev.from_date ? { to_date: prev.from_date } : {}),
                    }));
                  }}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm font-medium">Half Day</span>
              </label>
              {form.half_day && (
                <div className="flex gap-2">
                  {(["AM", "PM"] as const).map((period) => (
                    <label key={period} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="hr_half_day_period"
                        value={period}
                        checked={form.half_day_period === period}
                        onChange={() => setForm((prev) => ({ ...prev, half_day_period: period }))}
                        className="h-3.5 w-3.5"
                      />
                      <span className="text-sm">{period}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {isPastRange && (
              <div className="rounded-md border border-slate-200 bg-slate-50 dark:bg-slate-900/50 dark:border-slate-700 px-4 py-2 text-xs text-slate-600 dark:text-slate-400">
                Heads up: this range is in the past. That's fine for recording historical leave,
                but double-check the dates.
              </div>
            )}

            {previewLoading && form.leave_type === "Annual Leave" && form.from_date && form.to_date && (
              <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
                Checking leave balance…
              </div>
            )}

            {!previewLoading && splitPreview && form.leave_type === "Annual Leave" && (
              <div className="space-y-2 text-sm">
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 text-amber-800 dark:text-amber-300 space-y-0.5">
                  <p className="font-medium">Leave breakdown</p>
                  <p>
                    {splitPreview.total_weekdays} weekday{splitPreview.total_weekdays !== 1 ? "s" : ""}
                    {splitPreview.holidays_excluded.length > 0 && (
                      <> − {splitPreview.holidays_excluded.length} public holiday{splitPreview.holidays_excluded.length !== 1 ? "s" : ""} = <strong>{splitPreview.requested_days} leave day{splitPreview.requested_days !== 1 ? "s" : ""}</strong></>
                    )}
                    {splitPreview.holidays_excluded.length === 0 && (
                      <> = <strong>{splitPreview.requested_days} leave day{splitPreview.requested_days !== 1 ? "s" : ""}</strong></>
                    )}
                  </p>
                  {splitPreview.holidays_excluded.length > 0 && (
                    <ul className="list-disc list-inside pl-1 text-xs opacity-80">
                      {splitPreview.holidays_excluded.map((h) => (
                        <li key={h.date}>{h.description} ({new Date(h.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })})</li>
                      ))}
                    </ul>
                  )}
                </div>

                {splitPreview.needs_split && splitPreview.casual_to_date && (
                  <div className="space-y-2">
                    <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 px-4 py-3 text-blue-800 dark:text-blue-300">
                      <p className="font-semibold text-xs uppercase tracking-wide mb-1">Request 1 — Annual Leave (paid)</p>
                      <p>
                        {formatDate(form.from_date)} → {formatDate(splitPreview.casual_to_date)}
                        {" · "}<strong>{splitPreview.casual_days} day{splitPreview.casual_days !== 1 ? "s" : ""}</strong>
                      </p>
                    </div>
                    <div className="rounded-md border border-orange-200 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800 px-4 py-3 text-orange-800 dark:text-orange-300">
                      <p className="font-semibold text-xs uppercase tracking-wide mb-1">Request 2 — Leave Without Pay (unpaid)</p>
                      <p>
                        {splitPreview.lwp_from_date ? formatDate(splitPreview.lwp_from_date) : "—"} → {formatDate(form.to_date)}
                        {" · "}<strong>{splitPreview.lwp_days} day{splitPreview.lwp_days !== 1 ? "s" : ""}</strong>
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Annual Leave balance is {splitPreview.casual_balance} day{splitPreview.casual_balance !== 1 ? "s" : ""}. The remaining {splitPreview.lwp_days} day{splitPreview.lwp_days !== 1 ? "s" : ""} will be unpaid.
                    </p>
                  </div>
                )}

                {splitPreview.needs_split && !splitPreview.casual_to_date && (
                  <div className="rounded-md border border-orange-200 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800 px-4 py-3 text-orange-800 dark:text-orange-300 space-y-1">
                    <p className="font-semibold text-xs uppercase tracking-wide">Leave Without Pay (unpaid)</p>
                    <p>
                      {formatDate(form.from_date)} → {formatDate(form.to_date)}
                      {" · "}<strong>{splitPreview.lwp_days} day{splitPreview.lwp_days !== 1 ? "s" : ""}</strong>
                    </p>
                    <p className="text-xs opacity-80">Annual Leave balance is exhausted. This leave will be fully unpaid.</p>
                  </div>
                )}
              </div>
            )}

            <div>
              <Label htmlFor="description">Reason</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Optional: reason for the leave"
                rows={3}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              The leave will be created and automatically approved. For Annual Leave, if the balance is
              insufficient, the overflow is recorded as Leave Without Pay.
            </p>
          </div>

          <SheetFooter className="px-6 py-4 border-t shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Submitting…"
                : splitPreview?.needs_split && splitPreview.casual_to_date
                  ? "Add Both Leaves"
                  : "Add Leave"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
