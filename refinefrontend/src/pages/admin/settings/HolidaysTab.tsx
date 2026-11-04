import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createParser, useQueryState } from "nuqs";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatePanel } from "@/components/StatePanel";
import { yearVN } from "@/lib/businessTime";
import { ConfirmModal } from "./ConfirmModal";

interface Holiday {
  date: string;
  description: string;
  weekday: string;
}

const yearParser = createParser<number>({
  parse: (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : null;
  },
  serialize: (n) => String(n),
});

export function HolidaysTab() {
  const [yearParam, setYear] = useQueryState("year", yearParser.withOptions({ clearOnDefault: false }));
  const year = yearParam ?? yearVN();
  const [listExists, setListExists] = useState(true);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
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
      if (id === requestId.current) {
        setHolidays(json.data ?? []);
        setListExists(json.exists !== false);
      }
    } catch (err) {
      console.error("load holidays failed", err);
      if (id === requestId.current) setLoadError(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHolidays(year); }, [year, fetchHolidays]);

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

  const yearOptions = useMemo(() => {
    const base = yearVN();
    return [...new Set([base - 1, base, base + 1, year])].sort((x, y) => x - y);
  }, [year]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-2.5 gap-y-3">
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
          Year
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="h-10 rounded-input border border-input bg-card px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:h-12 max-md:text-base"
          >
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <span className="flex-1" />
        {listExists && !loadError && (
          <form
            className="flex w-full flex-wrap items-end gap-2 rounded-[14px] border bg-card px-3 py-2.5 md:w-auto"
            onSubmit={(e) => { e.preventDefault(); handleAdd(); }}
          >
            <div className="flex flex-col gap-1.5 text-[13px] font-semibold max-md:w-full">
              <Label htmlFor="holiday-date">Date</Label>
              <Input id="holiday-date" type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5 text-[13px] font-semibold max-md:w-full">
              <Label htmlFor="holiday-name">Name</Label>
              <Input id="holiday-name" placeholder="e.g. Company day off" value={addName} onChange={(e) => setAddName(e.target.value)} />
            </div>
            <Button type="submit" disabled={!addDate || !addName.trim() || saving} className="max-md:w-full">
              {saving && <Loader2 className="animate-spin" />}
              + Add holiday
            </Button>
          </form>
        )}
      </div>

      {formError && (
        <div role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{formError}</span>
        </div>
      )}

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
      ) : !listExists ? (
        <StatePanel
          kind="empty"
          title={`No holiday list for ${year} yet`}
          text={`Create "Vietnam ${year}" in ERPNext first, then holidays can be added here.`}
        />
      ) : holidays.length === 0 ? (
        <StatePanel
          kind="empty"
          title={`No public holidays in ${year}`}
          text="Add one above and it will count in leave calculations."
        />
      ) : (
        <section className="overflow-hidden rounded-2xl border bg-card">
          <div className="hidden items-center gap-3 bg-muted px-[18px] py-3 text-xs font-semibold text-muted-foreground md:flex">
            <span className="w-[220px]">Date</span>
            <span className="flex-1">Name</span>
            <span className="w-[90px]" />
          </div>
          <ul className="divide-y md:border-t">
            {holidays.map((h) => (
              <li key={h.date} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-[18px] py-3 tabular-nums md:min-h-14">
                <span className="text-sm max-md:w-full max-md:text-xs max-md:text-muted-foreground md:w-[220px] md:text-[15px]">{h.weekday.slice(0, 3)} {h.date}</span>
                <b className="min-w-0 flex-[1_1_160px] break-words text-[15px]">{h.description}</b>
                <span className="md:w-[90px]">
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Delete ${h.description} on ${h.date}`}
                    className="text-destructive hover:text-destructive"
                    onClick={() => { setDeleteError(null); setDeleteTarget(h); }}
                  >
                    Delete
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-[13px] text-muted-foreground">Holidays are skipped when counting leave days and payroll working days.</p>

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
