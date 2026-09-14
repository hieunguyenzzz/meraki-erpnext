import { useEffect, useMemo, useState } from "react";
import { useList, useOne } from "@refinedev/core";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetFooter, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { displayName } from "@/lib/format";
import type { VenueWeddingArea } from "@/lib/types";
import { EVENT_TYPES, STAFF_ROLES, type WeddingEvent } from "@/lib/weddingEvents";

interface PlannerEmployee {
  name: string;
  employee_name?: string;
  first_name?: string;
  last_name?: string;
}

interface StaffFormRow {
  employee: string;
  role: string;
  call_time: string;
  notes: string; // not shown in this UI; round-tripped so Desk-entered notes aren't lost on save
}

interface EventForm {
  event_type: string;
  event_date: string;
  start_time: string;
  end_time: string;
  venue_area: string;
  guest_count: string;
  notes: string;
  staff: StaffFormRow[];
}

const initialForm: EventForm = {
  event_type: "",
  event_date: "",
  start_time: "",
  end_time: "",
  venue_area: "",
  guest_count: "",
  notes: "",
  staff: [],
};

interface ProjectEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  venue?: string;
  event?: WeddingEvent;
  onSaved: () => void;
}

export function ProjectEventDialog({
  open,
  onOpenChange,
  projectId,
  venue,
  event,
  onSaved,
}: ProjectEventDialogProps) {
  const [form, setForm] = useState<EventForm>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (event) {
      setForm({
        event_type: event.event_type,
        event_date: event.event_date,
        start_time: event.start_time ? event.start_time.slice(0, 5) : "",
        end_time: event.end_time ? event.end_time.slice(0, 5) : "",
        venue_area: event.venue_area ?? "",
        guest_count: event.guest_count != null ? String(event.guest_count) : "",
        notes: event.notes ?? "",
        staff: event.staff.map((s) => ({
          employee: s.employee,
          role: s.role ?? "",
          call_time: s.call_time ? s.call_time.slice(0, 5) : "",
          notes: s.notes ?? "",
        })),
      });
    } else {
      setForm(initialForm);
    }
    setError(null);
  }, [open, event]);

  const { result: employeesResult } = useList<PlannerEmployee>({
    resource: "Employee",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "eq", value: "Active" }],
    meta: { fields: ["name", "employee_name", "first_name", "last_name"] },
    queryOptions: { enabled: open },
  });
  const employees = useMemo(() => employeesResult?.data ?? [], [employeesResult]);

  // Venue areas live on the Supplier's custom_venue_wedding_areas child table.
  const { result: venueResult } = useOne<{ custom_venue_wedding_areas?: VenueWeddingArea[] }>({
    resource: "Supplier",
    id: venue ?? "",
    meta: { fields: ["name", "custom_venue_wedding_areas"] },
    queryOptions: { enabled: open && !!venue },
  });
  const venueAreas = venueResult?.custom_venue_wedding_areas ?? [];

  function addStaffRow() {
    setForm((prev) => ({
      ...prev,
      staff: [...prev.staff, { employee: "", role: "", call_time: "", notes: "" }],
    }));
  }
  function updateStaffRow(idx: number, patch: Partial<StaffFormRow>) {
    setForm((prev) => ({
      ...prev,
      staff: prev.staff.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  }
  function removeStaffRow(idx: number) {
    setForm((prev) => ({ ...prev, staff: prev.staff.filter((_, i) => i !== idx) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.event_type || !form.event_date) {
      setError("Please fill in Event Type and Date");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      // PUT is a full replace: an existing event keeps its own venue (it may differ from the
      // project's current Sales Order venue). Only a brand-new event seeds from the project venue.
      const eventVenue = event ? event.venue : venue;
      const body = {
        project: projectId,
        event_type: form.event_type,
        event_date: form.event_date,
        start_time: form.start_time || undefined,
        end_time: form.end_time || undefined,
        venue: eventVenue || undefined,
        venue_area: form.venue_area || undefined,
        guest_count: form.guest_count ? Number(form.guest_count) : undefined,
        notes: form.notes || undefined,
        staff: form.staff
          .filter((s) => s.employee)
          .map((s) => ({
            employee: s.employee,
            role: s.role || undefined,
            call_time: s.call_time || undefined,
            notes: s.notes || undefined,
          })),
      };
      const url = event ? `/inquiry-api/wedding-events/${event.name}` : "/inquiry-api/wedding-events";
      const res = await fetch(url, {
        method: event ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? "Failed to save event");
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save event");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-2xl flex flex-col p-0">
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <SheetTitle>{event ? "Edit Event" : "Add Event"}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            <div>
              <Label>Event Type *</Label>
              <Select
                value={form.event_type || "__none__"}
                onValueChange={(v) => setForm((prev) => ({ ...prev, event_type: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select event type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- Select --</SelectItem>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label htmlFor="event_date">Date *</Label>
                <Input
                  id="event_date"
                  type="date"
                  value={form.event_date}
                  onChange={(e) => setForm((prev) => ({ ...prev, event_date: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="start_time">Start Time</Label>
                <Input
                  id="start_time"
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm((prev) => ({ ...prev, start_time: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="end_time">End Time</Label>
                <Input
                  id="end_time"
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm((prev) => ({ ...prev, end_time: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <Label>Venue Area</Label>
              {venue ? (
                <Select
                  value={form.venue_area || "__none__"}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, venue_area: v === "__none__" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select area" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- None --</SelectItem>
                    {venueAreas.map((a) => (
                      <SelectItem key={a.name} value={a.area_name}>{a.area_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={form.venue_area}
                  onChange={(e) => setForm((prev) => ({ ...prev, venue_area: e.target.value }))}
                  placeholder="Venue area"
                />
              )}
            </div>

            <div>
              <Label htmlFor="guest_count">Guest Count</Label>
              <Input
                id="guest_count"
                type="number"
                min="0"
                step="1"
                value={form.guest_count}
                onChange={(e) => setForm((prev) => ({ ...prev, guest_count: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Optional notes"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Staff</Label>
                <Button type="button" variant="outline" size="sm" onClick={addStaffRow}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Staff
                </Button>
              </div>
              {form.staff.length === 0 && (
                <p className="text-sm text-muted-foreground">No staff allocated yet.</p>
              )}
              <div className="space-y-2">
                {form.staff.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_1fr_110px_auto] gap-2 items-center">
                    <Select
                      value={row.employee || "__none__"}
                      onValueChange={(v) => updateStaffRow(idx, { employee: v === "__none__" ? "" : v })}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Employee" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- Select --</SelectItem>
                        {employees.map((emp) => (
                          <SelectItem key={emp.name} value={emp.name}>
                            {displayName(emp)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={row.role || "__none__"}
                      onValueChange={(v) => updateStaffRow(idx, { role: v === "__none__" ? "" : v })}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Role (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- None --</SelectItem>
                        {STAFF_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="time"
                      className="h-8"
                      value={row.call_time}
                      onChange={(e) => updateStaffRow(idx, { call_time: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => removeStaffRow(idx)}
                    >
                      <X className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <SheetFooter className="px-6 py-4 border-t shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : event ? "Save Changes" : "Add Event"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
