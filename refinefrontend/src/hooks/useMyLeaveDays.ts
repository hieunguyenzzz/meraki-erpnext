import { useEffect, useState } from "react";
import { totalAnnualLeaveDays } from "@/lib/leaveBalance";

/**
 * Annual Leave days the person can use today (GET /inquiry-api/leave/balance), as tile text:
 * null while loading, "—" when there is no linked Employee, "N d" otherwise.
 */
export function useMyLeaveDays(employeeId: string | null, profileLoading = false) {
  const [days, setDays] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setDays(null);
    setFailed(false);
    if (!employeeId) return;
    let cancelled = false;
    fetch(`/inquiry-api/leave/balance?employee=${encodeURIComponent(employeeId)}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`leave/balance returned ${r.status}`);
        return r.json();
      })
      .then((json) => { if (!cancelled) setDays(totalAnnualLeaveDays(json?.data)); })
      .catch((err: unknown) => {
        console.error("useMyLeaveDays: leave balance failed", err);
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [employeeId]);

  const display = !employeeId ? (profileLoading ? null : "—") : days === null ? null : `${days} d`;
  return { display, failed };
}
