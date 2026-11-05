import { useRef, useState } from "react";
import { useInvalidate } from "@refinedev/core";
import { responseError } from "./types";

type Action = "deleting" | "paying";

const ENDPOINT: Record<Action, string> = {
  deleting: "/inquiry-api/purchase-invoices/delete",
  paying: "/inquiry-api/purchase-invoices/mark-paid",
};

/** Bulk delete / mark paid through the backend, with a ref guard against double taps. */
export function useBulkActions(onDone: (failed: string[]) => void) {
  const invalidate = useInvalidate();
  const [action, setAction] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  async function run(kind: Action, names: string[]) {
    if (busy.current || names.length === 0) return;
    const noun = `${names.length} expense${names.length === 1 ? "" : "s"}`;
    const ok = kind === "deleting" ? confirm(`Delete ${noun}? This cannot be undone.`) : confirm(`Mark ${noun} as paid?`);
    if (!ok) return;
    busy.current = true;
    setAction(kind);
    setError(null);
    try {
      const res = await fetch(ENDPOINT[kind], {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names }),
      });
      if (!res.ok) throw await responseError(res, kind === "deleting" ? "Delete failed" : "Mark paid failed");
      const data = await res.json();
      const failed: string[] = (data.failed ?? []).map((s: string) => s.split(": ")[0]);
      if (failed.length) setError(`Some failed: ${data.failed.join(", ")}`);
      onDone(failed);
      invalidate({ resource: "Purchase Invoice", invalidates: ["list"] });
    } catch (err) {
      console.error("Bulk expense action failed", kind, err);
      setError(err instanceof Error ? err.message : "Bulk action failed");
    } finally {
      busy.current = false;
      setAction(null);
    }
  }

  return { action, error, clearError: () => setError(null), run };
}
