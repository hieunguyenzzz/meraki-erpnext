import { useCallback, useEffect, useMemo, useState } from "react";
import type { BalanceItem, LeaveBalance } from "./types";

interface BalanceResponse {
  data: BalanceItem[];
  old_period_active: boolean;
}

/** Leave balances from the backend (computed as admin, avoids field permission issues). */
export function useMyLeaveBalances(employeeId: string | null) {
  const [balanceData, setBalanceData] = useState<BalanceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const refetch = useCallback(() => {
    if (!employeeId) return;
    setIsError(false);
    fetch(`/inquiry-api/leave/balance?employee=${employeeId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Leave balance request failed: ${r.status}`);
        return r.json();
      })
      .then(setBalanceData)
      .catch((err) => {
        console.error("Could not load leave balances", err);
        setIsError(true);
      })
      .finally(() => setIsLoading(false));
  }, [employeeId]);

  useEffect(() => { refetch(); }, [refetch]);

  const balances = useMemo<LeaveBalance[]>(() => {
    if (!balanceData?.data) return [];
    const oldPeriodActive = balanceData.old_period_active;

    return balanceData.data
      .filter((item) => item.leave_type !== "Sick Leave")
      .map((item) => {
        const oldAllocDays = item.old_allocation ?? 0;
        const newAllocDays = item.new_allocation ?? 0;
        const rawOldTaken = item.old_taken ?? 0;
        const oldPending = item.old_pending ?? 0;
        const newTaken = item.new_taken ?? 0;
        const newPending = item.new_pending ?? 0;

        // Accrued amounts from backend (fall back to full allocation if missing)
        const oldAccrued = item.old_accrued ?? oldAllocDays;
        const newAccrued = item.new_accrued ?? newAllocDays;

        // Apply overflow: cap old taken at old allocation
        const cappedOldTaken = Math.min(rawOldTaken, oldAllocDays);
        const overflow = rawOldTaken - cappedOldTaken;

        // Cap usable at accrued amount
        const oldBalance = Math.min(oldAccrued, oldAllocDays) - cappedOldTaken - oldPending;
        const effectiveNewTaken = newTaken + overflow;
        const newBalance = Math.min(newAccrued, newAllocDays) - effectiveNewTaken - newPending;

        return {
          leaveType: item.leave_type,
          showOldPeriod: oldPeriodActive && oldAllocDays > 0,
          oldAllocDays,
          oldAccrued,
          oldTaken: cappedOldTaken,
          oldPending,
          oldBalance: Math.max(0, oldBalance),
          newAllocDays,
          newAccrued,
          newTaken: effectiveNewTaken,
          newPending,
          newBalance: Math.max(0, newBalance),
          totalBalance: Math.max(0, oldBalance) + Math.max(0, newBalance),
        };
      });
  }, [balanceData]);

  return { balances, isLoading, isError, refetch };
}
