/** Annual Leave days a person can use today, from GET /inquiry-api/leave/balance. */
export function totalAnnualLeaveDays(items: any[] | undefined): number | null {
  if (!items) return null;
  let total = 0;
  for (const item of items) {
    if (item.leave_type !== "Annual Leave") continue;
    const oldAllocDays = item.old_allocation ?? 0;
    const rawOldTaken = item.old_taken ?? 0;
    const oldPending = item.old_pending ?? 0;
    const newAllocDays = item.new_allocation ?? 0;
    const newTaken = item.new_taken ?? 0;
    const newPending = item.new_pending ?? 0;
    const oldAccrued = item.old_accrued ?? oldAllocDays;
    const newAccrued = item.new_accrued ?? newAllocDays;

    const cappedOldTaken = Math.min(rawOldTaken, oldAllocDays);
    const overflow = rawOldTaken - cappedOldTaken;
    const oldBalance = Math.min(oldAccrued, oldAllocDays) - cappedOldTaken - oldPending;
    const effectiveNewTaken = newTaken + overflow;
    const newBalance = Math.min(newAccrued, newAllocDays) - effectiveNewTaken - newPending;

    total += Math.max(0, oldBalance) + Math.max(0, newBalance);
  }
  return total;
}
