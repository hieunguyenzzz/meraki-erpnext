import { useCallback, useEffect, useRef, useState } from "react";
import type { FlightFilters, FlightListResponse, FlightSyncInfo, FlightSyncRun } from "./types";

const POLL_INTERVAL_MS = 5000;
const POLL_MAX_MS = 3 * 60 * 1000;

function buildQuery(f: FlightFilters): string {
  const p = new URLSearchParams();
  if (f.date_from) p.set("date_from", f.date_from);
  if (f.date_to) p.set("date_to", f.date_to);
  if (f.airline) p.set("airline", f.airline);
  if (f.project) p.set("project", f.project);
  if (f.employee) p.set("employee", f.employee);
  if (f.status) p.set("status", f.status);
  if (f.needs_review) p.set("needs_review", "1");
  const q = p.toString();
  return q ? `?${q}` : "";
}

function detailText(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        if (typeof d === "string") return d;
        const loc = Array.isArray(d?.loc) ? d.loc.filter((x: unknown) => x !== "body").join(".") : "";
        const msg = d?.msg ?? JSON.stringify(d);
        return loc ? `${loc}: ${msg}` : msg;
      })
      .join("; ");
  }
  return detail ? JSON.stringify(detail) : "";
}

export async function apiError(resp: Response, fallback: string): Promise<Error> {
  const body = await resp.json().catch(() => ({}));
  return new Error(detailText(body?.detail) || `${fallback} (${resp.status})`);
}

/** Loads GET /flights for the filters, and drives "Sync now" (POST, then poll until finished_at changes). */
export function useFlightBookings(filters: FlightFilters) {
  const [data, setData] = useState<FlightListResponse | null>(null);
  const [airlines, setAirlines] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const alive = useRef(true);
  const requestId = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchList = useCallback(async (): Promise<FlightListResponse> => {
    const resp = await fetch(`/inquiry-api/flights${buildQuery(filtersRef.current)}`, { credentials: "include" });
    if (!resp.ok) throw await apiError(resp, "Failed to load flight bookings");
    return resp.json();
  }, []);

  // Remember every airline seen (filtering is server-side) so the dropdown stays stable.
  const applyData = useCallback((next: FlightListResponse) => {
    setData(next);
    setAirlines((prev) => {
      const merged = new Set(prev);
      next.bookings.forEach((b) => b.airline && merged.add(b.airline));
      return merged.size === prev.length ? prev : [...merged].sort();
    });
  }, []);

  const refetch = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const next = await fetchList();
      if (!alive.current || id !== requestId.current) return; // stale: a newer request superseded this one
      applyData(next);
      setError(null);
    } catch (e) {
      if (!alive.current || id !== requestId.current) return;
      console.error("flights: list fetch failed", e);
      setError(e instanceof Error ? e.message : "Failed to load flight bookings");
    } finally {
      if (alive.current && id === requestId.current) setIsLoading(false);
    }
  }, [fetchList, applyData]);

  const key = buildQuery(filters);
  useEffect(() => {
    setIsLoading(true);
    void refetch();
  }, [key, refetch]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  const pollUntilFinished = useCallback((before: FlightSyncRun | null) => {
    const startedAt = Date.now();
    const arm = () => {
      if (!alive.current) return;
      pollTimer.current = setTimeout(poll, POLL_INTERVAL_MS);
    };
    const poll = async () => {
      if (!alive.current) return;
      try {
        const resp = await fetch("/inquiry-api/flights/sync-status", { credentials: "include" });
        if (!resp.ok) throw await apiError(resp, "Failed to read sync status");
        const status: FlightSyncInfo = await resp.json();
        if (!alive.current) return;
        const run = status.last_run;
        // Finished = a completed run that is not the one we saw before (or that one, if it was still running).
        const isNewRun = !!run && (!before || run.id !== before.id || !before.finished_at);
        if (run && run.finished_at && isNewRun) {
          setSyncing(false);
          void refetch(); // fetch the list once, now that the sync has finished
          return;
        }
      } catch (e) {
        if (!alive.current) return;
        console.error("flights: sync poll failed", e);
      }
      if (Date.now() - startedAt >= POLL_MAX_MS) {
        setSyncError("Sync is taking longer than 3 minutes; check again later");
        setSyncing(false);
        void refetch();
        return;
      }
      arm();
    };
    arm();
  }, [refetch]);

  const startSync = useCallback(async () => {
    setSyncError(null);
    setSyncNotice(null);
    setSyncing(true);
    const before = data?.sync.last_run ?? null;
    try {
      const resp = await fetch("/inquiry-api/flights/sync", { method: "POST", credentials: "include" });
      if (resp.status === 409) {
        setSyncNotice("Sync already running");
      } else if (!resp.ok) {
        throw await apiError(resp, "Failed to start sync");
      }
    } catch (e) {
      console.error("flights: sync start failed", e);
      if (alive.current) {
        setSyncError(e instanceof Error ? e.message : "Failed to start sync");
        setSyncing(false);
      }
      return;
    }
    pollUntilFinished(before);
  }, [data, pollUntilFinished]);

  return { data, airlines, isLoading, error, refetch, syncing, syncError, syncNotice, startSync };
}
