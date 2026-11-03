import { useRef, useState } from "react";
import { useInvalidate } from "@refinedev/core";

/**
 * Bulk delete for the selected journal entry names. Endpoint and payload are unchanged.
 * `onDone` receives the names the backend reported as failed so the caller can keep exactly those selected.
 */
export function useJournalDelete(names: string[], onDone: (failed: string[]) => void) {
  const invalidate = useInvalidate();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false); // a second tap must not send the batch twice

  async function deleteSelected() {
    if (names.length === 0 || inFlight.current) return;
    if (!confirm(`Delete ${names.length} journal ${names.length === 1 ? "entry" : "entries"}? Submitted entries will be cancelled first.`)) return;
    inFlight.current = true;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/inquiry-api/journal-entries/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Delete failed: ${res.status}`);
      }
      const data = await res.json();
      const failed: string[] = data.failed ?? [];
      if (failed.length) setError(`Some entries failed: ${failed.join(", ")}`);
      onDone(failed.map((f) => f.split(": ")[0]));
      invalidate({ resource: "Journal Entry", invalidates: ["list"] });
    } catch (err) {
      console.error("Journal entry delete failed", err);
      setError(err instanceof Error ? err.message : "Failed to delete entries");
    } finally {
      inFlight.current = false;
      setDeleting(false);
    }
  }

  return { deleting, error, clearError: () => setError(null), deleteSelected };
}
