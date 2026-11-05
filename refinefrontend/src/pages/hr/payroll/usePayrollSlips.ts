import { useCallback, useEffect, useState } from "react";
import { apiErrorMessage } from "@/lib/errors";
import type { PayrollEntry, SalarySlip } from "./types";

const NONE: SalarySlip[] = [];

/** Enriched salary slips (one backend call) of a payroll entry; refreshes keep the current rows on screen. */
export function usePayrollSlips(selectedPE: PayrollEntry | null) {
  // Results are tagged with the entry they belong to, so switching month never shows the previous month's rows.
  const [loaded, setLoaded] = useState<{ pe: string; slips: SalarySlip[] } | null>(null);
  const [failed, setFailed] = useState<{ pe: string; message: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const peName = selectedPE?.name;

  useEffect(() => {
    if (!peName) return;
    let cancelled = false;
    fetch(`/inquiry-api/payroll/slips?pe_name=${encodeURIComponent(peName)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(apiErrorMessage(json, `Failed to load salary slips (${res.status})`));
        if (!cancelled) { setLoaded({ pe: peName, slips: json.data ?? [] }); setFailed(null); }
      })
      .catch((err) => {
        console.error("payroll_slips_load_failed", { pe: peName, err });
        if (!cancelled) setFailed({ pe: peName, message: err instanceof Error ? err.message : "Failed to load salary slips" });
      });
    return () => { cancelled = true; };
  }, [peName, refreshKey]);

  const slips = loaded && loaded.pe === peName ? loaded.slips : NONE;
  const loadError = failed && failed.pe === peName ? failed.message : null;
  // Loading until the slips of the selected entry have arrived (or failed).
  const loading = !!peName && loaded?.pe !== peName && !loadError;
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return { slips, loading, loadError, refresh };
}
