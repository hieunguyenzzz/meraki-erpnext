import { useRef, useState } from "react";
import { useInvalidate } from "@refinedev/core";

export type InvoiceCategory = "Wedding Payment" | "Referral Commission";

/**
 * Bulk delete / assign-category for the selected invoice names. Endpoints and payloads are unchanged.
 * `onDone` receives the names that failed so the caller can keep exactly those selected.
 */
export function useInvoiceActions(names: string[], onDone: (failed: string[]) => void) {
  const invalidate = useInvalidate();
  const [deleting, setDeleting] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false); // a second tap or menu pick must not send the batch twice

  async function post(url: string, body: object, failLabel: string) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `${failLabel}: ${res.status}`);
    }
    const data = await res.json();
    const failed: string[] = data.failed ?? [];
    if (failed.length) setError(`Some invoices failed: ${failed.join(", ")}`);
    onDone(failed);
    invalidate({ resource: "Sales Invoice", invalidates: ["list"] });
  }

  async function run(setBusy: (b: boolean) => void, url: string, body: object, failLabel: string, logLabel: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await post(url, body, failLabel);
    } catch (err) {
      console.error(logLabel, err);
      setError(err instanceof Error ? err.message : failLabel);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function deleteSelected() {
    if (names.length === 0 || inFlight.current) return;
    if (!confirm(`Delete ${names.length} invoice${names.length === 1 ? "" : "s"}? Submitted invoices will be cancelled first.`)) return;
    await run(setDeleting, "/inquiry-api/sales-invoices/delete", { names }, "Delete failed", "Invoice delete failed");
  }

  async function assignCategory(category: InvoiceCategory) {
    if (names.length === 0 || inFlight.current) return;
    if (!confirm(`Mark ${names.length} invoice${names.length === 1 ? "" : "s"} as ${category}?`)) return;
    await run(setAssigning, "/inquiry-api/sales-invoices/assign-category", { names, category }, "Assign failed", "Invoice assign-category failed");
  }

  return { deleting, assigning, error, clearError: () => setError(null), deleteSelected, assignCategory };
}
