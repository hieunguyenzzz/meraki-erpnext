import { useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { STATUS_VARIANT } from "./flightColumns";
import { FlightPassengersTable, type PassengerDraft } from "./FlightPassengersTable";
import { FlightSegmentsTable } from "./FlightSegmentsTable";
import { SearchableSelect } from "./SearchableSelect";
import { formatDateTime24, reviewReasonList } from "./format";
import { apiError } from "./useFlightBookings";
import {
  FLIGHT_STATUSES, type FlightBooking, type FlightPatch, type FlightStatus, type Option, type PassengerPatch,
} from "./types";

interface Props {
  booking: FlightBooking | null;
  onClose: () => void;
  onChanged: () => void;               // refetch the list after a successful save / review
  isFinance: boolean;
  staffOptions: Option[];
  projectOptions: Option[];
}

function initialDrafts(b: FlightBooking): Record<string, PassengerDraft> {
  const out: Record<string, PassengerDraft> = {};
  for (const p of b.passengers) out[p.ticket_number] = { employee: p.employee ?? "", total: String(p.total ?? "") };
  return out;
}

/** Never assume optional collections exist. */
function normalise(b: FlightBooking): FlightBooking {
  return {
    ...b,
    segments: b.segments ?? [],
    passengers: b.passengers ?? [],
    source_emails: b.source_emails ?? [],
  };
}

export function FlightBookingSheet({ booking, onClose, onChanged, isFinance, staffOptions, projectOptions }: Props) {
  // The list returns a summary; the sheet renders from GET /flights/{name}.
  const [current, setCurrent] = useState<FlightBooking | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [project, setProject] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<FlightStatus>("Confirmed");
  const [drafts, setDrafts] = useState<Record<string, PassengerDraft>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = booking?.name ?? null;
  useEffect(() => {
    // On close (name null) keep the last booking so the content survives the slide-out animation.
    if (!name) return;
    let cancelled = false;
    setCurrent(null);
    setLoading(true);
    setLoadError(null);
    setError(null);
    fetch(`/inquiry-api/flights/${encodeURIComponent(name)}`, { credentials: "include" })
      .then(async (resp) => {
        if (!resp.ok) throw await apiError(resp, "Failed to load booking");
        return normalise(await resp.json());
      })
      .then((full) => { if (!cancelled) setCurrent(full); })
      .catch((e) => {
        console.error("flights: booking detail load failed", e);
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load booking");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [name, reloadKey]);

  useEffect(() => {
    if (!current) return;
    setProject(current.project ?? "");
    setNote(current.note ?? "");
    setStatus(current.status);
    setDrafts(initialDrafts(current));
  }, [current]);

  const patch = useMemo<FlightPatch>(() => {
    if (!current) return {};
    const out: FlightPatch = {};
    if (project !== (current.project ?? "")) out.project = project;
    if (note !== (current.note ?? "")) out.note = note;
    if (status !== current.status) out.status = status;
    const pax: PassengerPatch[] = [];
    for (const p of current.passengers) {
      const d = drafts[p.ticket_number];
      if (!d) continue;
      const change: PassengerPatch = { ticket_number: p.ticket_number };
      if (d.employee !== (p.employee ?? "")) change.employee = d.employee || null;
      if (isFinance && d.total.trim() !== "" && Number(d.total) !== p.total && !Number.isNaN(Number(d.total))) {
        change.total = Number(d.total);
      }
      if (change.employee !== undefined || change.total !== undefined) pax.push(change);
    }
    if (pax.length) out.passengers = pax;
    return out;
  }, [current, project, note, status, drafts, isFinance]);

  const dirty = Object.keys(patch).length > 0;

  async function call(path: string, init: RequestInit, failure: string) {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch(`/inquiry-api/flights/${encodeURIComponent(current.name)}${path}`, {
        ...init,
        credentials: "include",
      });
      if (!resp.ok) throw await apiError(resp, failure);
      setCurrent(normalise(await resp.json()));
      onChanged();
    } catch (e) {
      console.error("flights: sheet request failed", e);
      setError(e instanceof Error ? e.message : failure);
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    call("", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }, "Failed to save booking");

  async function markReviewed() {
    if (!current) return;
    setBusy(true);
    setError(null);
    const url = `/inquiry-api/flights/${encodeURIComponent(current.name)}`;
    try {
      const resp = await fetch(`${url}/review`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modified: current.modified }),
      });
      if (resp.status === 409) {
        setError("Booking changed since you opened it; reload");
        const fresh = await fetch(url, { credentials: "include" });
        if (fresh.ok) setCurrent(normalise(await fresh.json()));
        onChanged();
        return;
      }
      if (!resp.ok) throw await apiError(resp, "Failed to mark reviewed");
      setCurrent(normalise(await resp.json()));
      onChanged();
    } catch (e) {
      console.error("flights: mark reviewed failed", e);
      setError(e instanceof Error ? e.message : "Failed to mark reviewed");
    } finally {
      setBusy(false);
    }
  }

  const reasons = reviewReasonList(current?.review_reasons);
  const projectChoices = useMemo(() => {
    // Keep the current wedding selectable even if it is missing from the Project list.
    if (current?.project && !projectOptions.some((o) => o.value === current.project)) {
      return [{ value: current.project, label: current.project_name || current.project }, ...projectOptions];
    }
    return projectOptions;
  }, [current, projectOptions]);

  return (
    <Sheet open={!!booking} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-5xl">
        {!current && (
          <div className="mt-6 space-y-3 text-sm">
            <SheetTitle>{loadError ? "Flight booking" : "Flight booking (loading)"}</SheetTitle>
            {loadError ? (
              <>
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
                  {loadError}
                </div>
                <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>Retry</Button>
              </>
            ) : (
              loading && <p className="text-muted-foreground">Loading booking...</p>
            )}
          </div>
        )}
        {current && (
          <>
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{current.booking_code}</span>
                <span className="text-base font-normal text-muted-foreground">
                  {current.airline} · {current.route}
                </span>
                <Badge variant={STATUS_VARIANT[current.status] ?? "secondary"}>{current.status}</Badge>
              </SheetTitle>
            </SheetHeader>

            <div className="mt-4 space-y-5">
              {reasons.length > 0 && current.needs_review ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertCircle className="h-4 w-4" /> Needs review
                  </div>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-6">
                    {reasons.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                  {isFinance && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="mt-3 inline-block">
                            <Button size="sm" variant="outline" disabled={busy || dirty} onClick={markReviewed}>
                              Mark reviewed
                            </Button>
                          </span>
                        </TooltipTrigger>
                        {dirty && <TooltipContent>Save changes first</TooltipContent>}
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              ) : reasons.length > 0 ? (
                <details className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground" open={reasons.length <= 3}>
                  <summary className="cursor-pointer font-medium">Review history</summary>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-6">
                    {reasons.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </details>
              ) : null}

              <section className="space-y-2">
                <h3 className="text-sm font-medium">Segments</h3>
                <FlightSegmentsTable segments={current.segments} />
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-medium">Passengers</h3>
                <FlightPassengersTable
                  passengers={current.passengers}
                  currency={current.currency}
                  drafts={drafts}
                  onDraftChange={(ticket, d) => setDrafts((prev) => ({ ...prev, [ticket]: d }))}
                  staffOptions={staffOptions}
                  canEditTotal={isFinance}
                />
              </section>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Wedding</Label>
                  <SearchableSelect
                    options={projectChoices}
                    value={project}
                    onChange={setProject}
                    placeholder="No wedding"
                    clearLabel="No wedding"
                    searchPlaceholder="Search weddings..."
                    className="w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as FlightStatus)}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FLIGHT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Note</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
              </div>

              <section className="space-y-2">
                <h3 className="text-sm font-medium">Source emails</h3>
                {current.source_emails.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {current.source_emails.map((e) => (
                      <li key={e.message_id} className="flex gap-2">
                        <span className="shrink-0 whitespace-nowrap text-muted-foreground">{formatDateTime24(e.date)}</span>
                        <Badge variant="outline" className="shrink-0">{e.email_type}</Badge>
                        <span className="truncate" title={e.subject}>{e.subject}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
                  {error}
                </div>
              )}
            </div>

            <SheetFooter className="mt-6">
              <Button variant="outline" onClick={onClose} disabled={busy}>Close</Button>
              <Button onClick={save} disabled={busy || !dirty}>{busy ? "Saving..." : "Save"}</Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
