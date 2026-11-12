import { useCallback, useRef, useState } from "react";
import { useInvalidate } from "@refinedev/core";
import { apiErrorMessage, extractErrorMessage } from "@/lib/errors";
import type { PayrollEntry } from "./types";

/**
 * Generate / Recalculate, Submit All, PDF export and manual Bonus. Same endpoints and payloads as before;
 * every action is guarded by a ref so a double tap cannot send twice.
 */
export function usePayrollActions(opts: { month: string; monthEnd: string; selectedPE: PayrollEntry | null; refresh: () => void }) {
  const { month, monthEnd, selectedPE, refresh } = opts;
  const invalidate = useInvalidate();
  const [isRunning, setIsRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bonusSaves, setBonusSaves] = useState(0); // bonus saves in flight; runs wait for them
  const bonusRef = useRef(0);
  const busy = useRef({ run: false, submit: false, pdf: false });
  const peName = selectedPE?.name;

  /** Resolves true when saved; false (with the error shown) when it failed. */
  const setBonus = useCallback(async (employee: string, amount: number): Promise<boolean> => {
    if (!peName) return false;
    setError(null);
    bonusRef.current += 1;
    setBonusSaves(bonusRef.current);
    try {
      const res = await fetch("/inquiry-api/payroll/bonus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pe_name: peName, employee, amount }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(apiErrorMessage(err, `Failed to set bonus: ${res.status}`));
      }
      refresh();
      return true;
    } catch (err) {
      console.error("payroll_bonus_failed", { pe: peName, employee, err });
      setError(extractErrorMessage(err, "Failed to set bonus"));
      return false;
    } finally {
      bonusRef.current -= 1;
      setBonusSaves(bonusRef.current);
    }
  }, [peName, refresh]);

  async function generate() {
    if (busy.current.run || bonusRef.current > 0) return;
    busy.current.run = true;
    setIsRunning(true);
    setError(null);
    try {
      const res = await fetch("/inquiry-api/generate-payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: month, end_date: monthEnd }),
      });
      if (!res.ok) throw new Error(`Payroll generation failed: ${res.status}`);
      invalidate({ resource: "Payroll Entry", invalidates: ["list"] });
      invalidate({ resource: "Additional Salary", invalidates: ["list"] });
      refresh();
    } catch (err) {
      console.error("payroll_generate_failed", { month, err });
      setError(extractErrorMessage(err, "Failed to generate payroll"));
    } finally {
      busy.current.run = false;
      setIsRunning(false);
    }
  }

  async function submitAll() {
    if (!peName || busy.current.submit || bonusRef.current > 0) return;
    busy.current.submit = true;
    setSubmitting(true);
    setError(null);
    try {
      const resp = await fetch("/inquiry-api/payroll/submit-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payroll_entry: peName }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(apiErrorMessage(err, "Failed to submit payroll"));
      }
      const result = await resp.json();
      if (result.failed && result.failed.length > 0) setError(result.failed.join(" | "));
    } catch (err) {
      console.error("payroll_submit_failed", { pe: peName, err });
      setError(extractErrorMessage(err, "Failed to submit payroll"));
    } finally {
      busy.current.submit = false;
      setSubmitting(false);
      invalidate({ resource: "Payroll Entry", invalidates: ["list"] });
      refresh();
    }
  }

  async function exportPdf() {
    if (!peName || busy.current.pdf) return;
    busy.current.pdf = true;
    setExporting(true);
    setError(null);
    try {
      const res = await fetch(`/inquiry-api/payroll/slips/pdf?pe_name=${encodeURIComponent(peName)}`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(apiErrorMessage(err, `PDF export failed: ${res.status}`));
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `bang-luong-${month.slice(0, 7)}.pdf`;
      a.click();
      // Some mobile/PWA browsers start the download after the click returns; revoking at once cancels it.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error("payroll_pdf_failed", { pe: peName, err });
      setError(extractErrorMessage(err, "Failed to export PDF"));
    } finally {
      busy.current.pdf = false;
      setExporting(false);
    }
  }

  return { bonusSaving: bonusSaves > 0, isRunning, submitting, exporting, error, setError, setBonus, generate, submitAll, exportPdf };
}
