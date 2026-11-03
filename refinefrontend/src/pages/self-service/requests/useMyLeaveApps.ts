import { useCallback, useEffect, useRef, useState } from "react";
import type { LeaveApplication } from "./types";

/** The employee's leave applications, plus the self-cancel action (one request at a time). */
export function useMyLeaveApps(employeeId: string | null, onChanged: () => void) {
  const [apps, setApps] = useState<LeaveApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const cancelling = useRef(false);

  const refetch = useCallback(() => {
    if (!employeeId) return;
    setIsLoading(true);
    setIsError(false);
    fetch(`/inquiry-api/leave/my-applications?employee=${employeeId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Leave applications request failed: ${r.status}`);
        return r.json();
      })
      .then((d) => setApps(d.data ?? []))
      .catch((err) => {
        console.error("Could not load leave applications", err);
        setIsError(true);
      })
      .finally(() => setIsLoading(false));
  }, [employeeId]);

  useEffect(() => { refetch(); }, [refetch]);

  async function cancel(leaveId: string) {
    if (!employeeId || cancelling.current) return;
    cancelling.current = true;
    setCancellingId(leaveId);
    setCancelError(null);
    try {
      const res = await fetch(`/inquiry-api/leave/${leaveId}/cancel-self`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee: employeeId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("Cancel leave failed", leaveId, res.status, err);
        setCancelError(err.detail ?? "Failed to cancel leave");
        return;
      }
      refetch();
      onChanged();
    } catch (err) {
      console.error("Cancel leave failed", leaveId, err);
      setCancelError("Failed to cancel leave");
    } finally {
      cancelling.current = false;
      setCancellingId(null);
    }
  }

  return { apps, isLoading, isError, refetch, cancel, cancellingId, cancelError };
}
