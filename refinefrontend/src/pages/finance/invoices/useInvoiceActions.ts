import { useState } from "react";
import { useInvalidate } from "@refinedev/core";

export type InvoiceCategory = "Wedding Payment" | "Referral Commission";

/** Bulk delete / assign-category for the selected invoice names. Endpoints and payloads are unchanged. */
export function useInvoiceActions(names: string[], onDone: () => void) {
  const invalidate = useInvalidate();
  const [deleting, setDeleting] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (data.failed?.length) setError(`Some invoices failed: ${data.failed.join(", ")}`);
    onDone();
    invalidate({ resource: "Sales Invoice", invalidates: ["list"] });
  }

  async function deleteSelected() {
    if (names.length === 0) return;
    if (!confirm(`Delete ${names.length} invoice${names.length === 1 ? "" : "s"}? Submitted invoices will be cancelled first.`)) return;
    setDeleting(true);
    setError(null);
    try {
      await post("/inquiry-api/sales-invoices/delete", { names }, "Delete failed");
    } catch (err) {
      console.error("Invoice delete failed", err);
      setError(err instanceof Error ? err.message : "Failed to delete invoices");
    } finally {
      setDeleting(false);
    }
  }

  async function assignCategory(category: InvoiceCategory) {
    if (names.length === 0) return;
    setAssigning(true);
    setError(null);
    try {
      await post("/inquiry-api/sales-invoices/assign-category", { names, category }, "Assign failed");
    } catch (err) {
      console.error("Invoice assign-category failed", err);
      setError(err instanceof Error ? err.message : "Failed to assign category");
    } finally {
      setAssigning(false);
    }
  }

  return { deleting, assigning, error, clearError: () => setError(null), deleteSelected, assignCategory };
}
