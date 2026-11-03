import { useCallback, useEffect, useState } from "react";
import type { WfhRequest } from "./types";

export function useMyWfh(employeeId: string | null) {
  const [requests, setRequests] = useState<WfhRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const refetch = useCallback(() => {
    if (!employeeId) return;
    setIsLoading(true);
    setIsError(false);
    fetch(`/inquiry-api/wfh/list?employee=${employeeId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`WFH list request failed: ${r.status}`);
        return r.json();
      })
      .then((d) => setRequests(d.data ?? []))
      .catch((err) => {
        console.error("Could not load WFH requests", err);
        setIsError(true);
      })
      .finally(() => setIsLoading(false));
  }, [employeeId]);

  useEffect(() => { refetch(); }, [refetch]);

  return { requests, isLoading, isError, refetch };
}
