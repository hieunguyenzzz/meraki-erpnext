import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, Info, Loader2, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatePanel } from "@/components/StatePanel";
import { yearVN } from "@/lib/businessTime";
import { ConfirmModal } from "./ConfirmModal";
import { FormModal } from "./FormModal";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Holiday {
  date: string;
  description: string;
  weekday: string;
  month: number;
}

export function HolidaysTab() {
  const [year, setYear] = useState(yearVN());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addDate, setAddDate] = useState("");
  const [addName, setAddName] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Holiday | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const requestId = useRef(0);

  const fetchHolidays = useCallback(async (y: number) => {
    const id = ++requestId.current;
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/inquiry-api/settings/holidays?year=${y}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (id === requestId.current) setHolidays(json.data ?? []);
    } catch (err) {
      console.error("load holidays failed", err);
      if (id === requestId.current) setLoadError(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHolidays(year); }, [year, fetchHolidays]);

  const byMonth = useMemo(() => {
    const map = new Map<number, Holiday[]>();
    for (const h of holidays) map.set(h.month, [...(map.get(h.month) ?? []), h]);
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [holidays]);

  async function handleAdd() {
    if (!addDate || !addName.trim() || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/inquiry-api/settings/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holiday_date: addDate, description: addName.trim() }),
      });
      if (res.status === 409) { setFormError("A holiday already exists on this date."); return; }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        console.error("add holiday failed", res.status, j);
        setFormError(typeof j.detail === "string" ? j.detail : "Failed to add holiday.");
        return;
      }
      // Show the year the holiday was added to so it is visible straight away.
      const addedYear = Number(addDate.slice(0, 4));
      setAddOpen(false);
      setAddDate("");
      setAddName("");
      if (addedYear && addedYear !== year) setYear(addedYear);
      else await fetchHolidays(year);
    } catch (err) {
      console.error("add holiday error", err);
      setFormError("Failed to add holiday.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget || inFlight.current) return;
    inFlight.current = true;
    setDeleting(true);
    setDeleteError(null);
    const date = deleteTarget.date;
    try {
      const res = await fetch(`/inquiry-api/settings/holidays/${date}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setHolidays((prev) => prev.filter((h) => h.date !== date));
      setDeleteTarget(null);
    } catch (err) {
      console.error("delete holiday failed", err);
      setDeleteError("Failed to delete the holiday.");
    } finally {
      inFlight.current = false;
      setDeleting(false);
    }
  }

  const openAdd = () => { setFormError(null); setAddOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1" role="group" aria-label="Year">
          <Button variant="ghost" size="icon" aria-label="Previous year" onClick={() => setYear((y) => y - 1)}>
            <ChevronLeft />
          </Button>
          <span className="w-14 text-center text-base font-semibold" aria-live="polite">{year}</span>
          <Button variant="ghost" size="icon" aria-label="Next year" onClick={() => setYear((y) => y + 1)}>
            <ChevronRight />
          </Button>
        </div>
        <Button onClick={openAdd}>
          <Plus /> Add holiday
        </Button>
      </div>

      <div className="flex items-start gap-2.5 rounded-2xl border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Saturdays and Sundays are left out of leave calculations automatically. Only public holidays are listed here.</span>
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}
        </div>
      ) : loadError ? (
        <StatePanel
          kind="error"
          title="Could not load holidays"
          text="Check your connection and try again."
          action={{ label: "Try again", onClick: () => fetchHolidays(year) }}
        />
      ) : byMonth.length === 0 ? (
        <StatePanel
          kind="empty"
          title={`No public holidays in ${year}`}
          text="Add one and it will count in leave calculations."
          action={{ label: "Add holiday", onClick: openAdd, icon: <Plus /> }}
        />
      ) : (
        <div className="space-y-4">
          {byMonth.map(([month, items]) => (
            <section key={month} className="overflow-hidden rounded-2xl border bg-card" aria-label={MONTH_NAMES[month - 1]}>
              <div className="flex items-center gap-2 bg-muted/50 px-4 py-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{MONTH_NAMES[month - 1]}</h3>
                <Badge variant="secondary">{items.length}</Badge>
              </div>
              <ul className="divide-y">
                {items.map((h) => (
                  <li key={h.date} className="flex items-center gap-3 py-1 pl-4 pr-2">
                    <div className="w-36 shrink-0 text-sm whitespace-nowrap">
                      <span className="font-semibold tabular-nums">{h.date}</span>
                      <span className="ml-1.5 text-xs text-muted-foreground">{h.weekday.slice(0, 3)}</span>
                    </div>
                    <span className="min-w-0 flex-1 text-sm">{h.description}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${h.description} on ${h.date}`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => { setDeleteError(null); setDeleteTarget(h); }}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <FormModal open={addOpen} onOpenChange={(o) => { if (!saving) setAddOpen(o); }} title="Add public holiday">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleAdd(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="holiday-date">Date</Label>
            <Input id="holiday-date" type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="holiday-name">Holiday name</Label>
            <Input id="holiday-name" placeholder="e.g. Company anniversary" value={addName} onChange={(e) => setAddName(e.target.value)} />
          </div>
          {formError && (
            <div role="alert" className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{formError}</span>
            </div>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={!addDate || !addName.trim() || saving}>
              {saving && <Loader2 className="animate-spin" />}
              Add holiday
            </Button>
          </div>
        </form>
      </FormModal>

      <ConfirmModal
        open={deleteTarget !== null}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title="Delete public holiday"
        body={<>Delete <b className="text-foreground">{deleteTarget?.description}</b> on {deleteTarget?.date}? Leave calculations will count that day as a working day again.</>}
        confirmLabel="Delete"
        destructive
        busy={deleting}
        error={deleteError}
        onConfirm={handleDelete}
      />
    </div>
  );
}
