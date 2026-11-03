import { useRef, useState } from "react";
import { useInvalidate } from "@refinedev/core";

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

  /** Resolves true when every record was deleted. */
  async function deleteMany(names: string[]): Promise<boolean> {
    if (busy.current) return false;
    busy.current = true;
    setIsDeleting(true);
    setError(null);
    try {
      for (const name of names) {
        const res = await fetch(`/inquiry-api/leave/${encodeURIComponent(name)}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`Failed to delete ${name}`);
      }
      return true;
    } catch (err) {
      console.error("leave delete failed", err);
      setError(err instanceof Error ? err.message : "Delete failed. Please try again.");
      return false;
    } finally {
      refresh();
      busy.current = false;
      setIsDeleting(false);
    }
  }

  return { processingId, isDeleting, error, setError, decide, deleteMany };
}
