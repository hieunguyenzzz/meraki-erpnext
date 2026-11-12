import { useEffect, useState } from "react";
import type { WeddingEvent } from "@/lib/weddingEvents";

/** Events of one wedding from /inquiry-api/wedding-events, for the at-a-glance views. */
export function useWeddingEvents(projectId: string) {
  const [events, setEvents] = useState<WeddingEvent[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/inquiry-api/wedding-events?project=${encodeURIComponent(projectId)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((d) => { if (!cancelled) setEvents(d?.events ?? []); })
      .catch((err) => console.error("[wedding] events load failed", projectId, err));
    return () => { cancelled = true; };
  }, [projectId]);
  return events;
}
