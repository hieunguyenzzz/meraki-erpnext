import { useState } from "react";
import { useList, useInvalidate } from "@refinedev/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

  function resetForm() {
    setForm(initialForm);
    setError(null);
    setSuccess(null);
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
              {isSubmitting ? "Submitting…" : "Add Leave"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
