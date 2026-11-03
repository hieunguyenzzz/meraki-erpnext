import { useRef, useState } from "react";
import { useInvalidate, useList } from "@refinedev/core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { todayVN } from "@/lib/businessTime";
import type { Employee } from "@/lib/types";

interface Props {
  employee: Employee;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

/** Schedule a performance review (also adds it to the calendar). Mounted only while open so the form always starts fresh. */
export function ScheduleReviewDialog({ employee, open, onOpenChange }: Props) {
  const invalidate = useInvalidate();
  const [form, setForm] = useState({ date: todayVN(), time: "09:00", notes: "", participants: [] as string[] });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const { result } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "eq", value: "Active" }],
    sorters: [{ field: "employee_name", order: "asc" }],
    meta: { fields: ["name", "employee_name"] },
  });
  const allEmployees = (result?.data ?? []) as unknown as { name: string; employee_name: string }[];

  function toggleParticipant(id: string) {
    setForm((prev) => ({
      ...prev,
      participants: prev.participants.includes(id) ? prev.participants.filter((p) => p !== id) : [...prev.participants, id],
    }));
  }

  async function submit() {
    if (!form.date || busy.current) return;
    busy.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/inquiry-api/review/${encodeURIComponent(employee.name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          review_date: form.date,
          review_time: form.time,
          notes: form.notes,
          participants: form.participants,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `API error ${res.status}`);
      }
      invalidate({ resource: "Meraki Review", invalidates: ["list"] });
      invalidate({ resource: "Employee", id: employee.name, invalidates: ["detail"] });
      onOpenChange(false);
    } catch (err) {
      console.error("Schedule review failed", employee.name, err);
      setError(err instanceof Error ? err.message : "Failed to schedule review");
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Performance Review</DialogTitle>
          <p className="text-sm text-muted-foreground">{employee.employee_name}</p>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="schedule-date">Review Date</Label>
            <Input id="schedule-date" type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="schedule-time">Time</Label>
            <Input id="schedule-time" type="time" value={form.time} onChange={(e) => setForm((p) => ({ ...p, time: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="schedule-notes">Notes</Label>
            <Textarea
              id="schedule-notes"
              placeholder="Review agenda or notes..."
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              className="min-h-[80px]"
            />
          </div>
          <div className="space-y-2">
            <Label>Participants</Label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-input border p-2">
              {allEmployees.map((emp) => {
                const isSelected = form.participants.includes(emp.name);
                const isSelf = emp.name === employee.name;
                return (
                  <Button
                    key={emp.name}
                    type="button"
                    size="sm"
                    variant={isSelected ? "default" : "outline"}
                    aria-pressed={isSelected}
                    className="h-10 w-full justify-start text-left"
                    onClick={() => !isSelf && toggleParticipant(emp.name)}
                    disabled={isSelf}
                  >
                    {emp.employee_name}
                    {isSelf && <span className="ml-auto text-xs opacity-60">self</span>}
                  </Button>
                );
              })}
            </div>
            {form.participants.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {form.participants.length} participant{form.participants.length > 1 ? "s" : ""} selected
              </p>
            )}
          </div>
          {error && <p role="alert" className="text-sm text-danger-soft-foreground">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !form.date}>{submitting ? "Scheduling…" : "Schedule & Add to Calendar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
