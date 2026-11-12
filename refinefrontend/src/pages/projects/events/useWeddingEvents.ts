import { useCallback, useEffect, useState } from "react";
import type { StaffEventCount, WeddingEvent } from "@/lib/weddingEvents";

/** Loads /inquiry-api/wedding-events for a date window; the backend does the scoping. */
export function useWeddingEvents(from: string, to: string) {
  const [events, setEvents] = useState<WeddingEvent[]>([]);
  const [staffCounts, setStaffCounts] = useState<StaffEventCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ from, to });
    fetch(`/inquiry-api/wedding-events?${params}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.detail ?? `Failed to load events (${r.status})`);
        }
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setEvents(data?.events ?? []);
        setStaffCounts(data?.staff_counts ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[EventsPage] failed to load wedding events", err);
        setEvents([]);
        setStaffCounts([]);
        setError(err instanceof Error ? err.message : "Failed to load events");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { events, staffCounts, isLoading, error, reload };
}
