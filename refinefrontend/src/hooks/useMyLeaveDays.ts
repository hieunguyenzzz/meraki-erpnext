import { useEffect, useState } from "react";
import { totalAnnualLeaveDays } from "@/lib/leaveBalance";

/** Annual Leave days the person can use today (GET /inquiry-api/leave/balance). days null = loading. */
export function useMyLeaveDays(employeeId: string | null) {
  const [days, setDays] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
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
  return { days, failed };
}
