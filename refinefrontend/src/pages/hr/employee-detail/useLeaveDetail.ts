import { useCallback, useEffect, useMemo, useState } from "react";
import type { LeaveBalance, LeavePeriod } from "./types";

interface LeaveDetailResponse {
  periods?: LeavePeriod[];
}

/** Leave balance from the backend (period-grouped, no client-side date logic). */
export function useLeaveDetail(employee: string | undefined) {
  const [detail, setDetail] = useState<LeaveDetailResponse | null>(null);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const refetch = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!employee) return;
    setError(false);
    fetch(`/inquiry-api/leave/employee-detail?employee=${encodeURIComponent(employee)}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`Leave detail ${r.status}`);
        return r.json();
      })
      .then((data) => setDetail(data))
      .catch((err) => {
        console.error("Could not load leave balance for", employee, err);
        setDetail(null);
        setError(true);
      });
  }, [employee, version]);

  // Sick Leave is unlimited and not tracked on the staff page.
  const periods = useMemo<LeavePeriod[]>(
    () =>
      (detail?.periods ?? [])
        .map((p) => ({ ...p, allocations: (p.allocations ?? []).filter((a) => a.leave_type !== "Sick Leave") }))
        .filter((p) => p.allocations.length > 0),
    [detail],
  );

  // Current period only: an expired pool's days are forfeited, so counting them
  // made a healthy balance look spent (12/35 instead of 12/19). The expired pool
  // stays visible in the per-period breakdown.
  const balance = useMemo<LeaveBalance>(
    () =>
      periods
        .filter((p) => p.is_current)
        .reduce<LeaveBalance>(
          (acc, p) => {
            for (const a of p.allocations) {
              acc.allocated += a.allocated;
              acc.accrued += a.usable ?? a.allocated;
              acc.taken += a.taken;
              acc.remaining += a.balance;
            }
            return acc;
          },
          { allocated: 0, accrued: 0, taken: 0, remaining: 0 },
        ),
    [periods],
  );

  return { periods, balance, error, loading: !detail && !error, refetch };
}
