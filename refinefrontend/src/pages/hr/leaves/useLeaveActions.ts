import { useRef, useState } from "react";
import { useInvalidate } from "@refinedev/core";

/** FastAPI errors carry {"detail": "..."}; fall back to the raw body. */
async function serverReason(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const detail = (JSON.parse(text) as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  } catch { /* body was not JSON */ }
  return text || `HTTP ${res.status}`;
}

type Verb = "approve" | "reject" | "re-approve";

/** Approve / reject / re-approve one application and bulk delete; double taps are blocked with a ref. */
export function useLeaveActions() {
  const invalidate = useInvalidate();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  function refresh() {
    invalidate({ resource: "Leave Application", invalidates: ["list"] });
  }

  async function decide(appName: string, verb: Verb) {
    if (busy.current) return;
    busy.current = true;
    setProcessingId(appName);
    setError(null);
    try {
      const res = await fetch(`/inquiry-api/leave/${encodeURIComponent(appName)}/${verb}`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      refresh();
    } catch (err) {
      console.error(`leave ${verb} failed`, appName, err);
      setError(`Failed to ${verb} ${appName}. Please try again.`);
    } finally {
      busy.current = false;
      setProcessingId(null);
    }
  }

  /** Deletes every record it can; returns the names that were deleted. Failures are reported, not fatal. */
  async function deleteMany(names: string[]): Promise<string[]> {
    if (busy.current) return [];
    busy.current = true;
    setIsDeleting(true);
    setError(null);
    const deleted: string[] = [];
    const failed: { name: string; reason: string }[] = [];
    try {
      for (const name of names) {
        try {
          const res = await fetch(`/inquiry-api/leave/${encodeURIComponent(name)}`, { method: "DELETE" });
          if (!res.ok) throw new Error(await serverReason(res));
          deleted.push(name);
        } catch (err) {
          console.error("leave delete failed", name, err);
          failed.push({ name, reason: err instanceof Error ? err.message : String(err) });
        }
      }
      if (failed.length > 0) {
        setError(`Deleted ${deleted.length} of ${names.length}; ${failed.map((f) => `${f.name} failed: ${f.reason}`).join("; ")}`);
      }
      return deleted;
    } finally {
      refresh();
      busy.current = false;
      setIsDeleting(false);
    }
  }

  return { processingId, isDeleting, error, setError, decide, deleteMany };
}
