import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Outcome } from "@/hooks/useNotificationActions";
import type { WfhRequest } from "./types";

type Action = "approve" | "reject";

/**
 * WFH list plus approve/reject for the HR page. A decision flips `outcomes` at once and is
 * rolled back (with `errors`) if the API fails; the list reloads shortly after a success.
 */
export function useWfhRequests() {
  const queryClient = useQueryClient();
  const [requests, setRequests] = useState<WfhRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const inFlight = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const alive = useRef(true);
  const loadedOnce = useRef(false);

  /** Returns whether the list was refreshed. Once data has loaded, a failed reload keeps the list and only flags `refreshFailed`. */
  const load = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/inquiry-api/wfh/list-all");
      if (!res.ok) throw new Error(`list-all ${res.status}`);
      const json = await res.json();
      if (!alive.current) return false;
      setRequests(json.data ?? []);
      setLoadError(false);
      setRefreshFailed(false);
      loadedOnce.current = true;
      return true;
    } catch (err) {
      console.error("wfh_list_failed", { firstLoad: !loadedOnce.current, err });
      if (alive.current) {
        if (loadedOnce.current) setRefreshFailed(true);
        else setLoadError(true);
      }
      return false;
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
    };
  }, [load]);

  const retry = () => {
    if (!loadedOnce.current) setLoading(true);
    void load();
  };

  const patch = <T,>(set: React.Dispatch<React.SetStateAction<Record<string, T>>>, name: string, value: T | null) =>
    set((prev) => {
      const next = { ...prev };
      if (value === null) delete next[name];
      else next[name] = value;
      return next;
    });

  async function decide(name: string, action: Action): Promise<void> {
    if (inFlight.current.has(name)) return;
    inFlight.current.add(name);
    setProcessing(new Set(inFlight.current));
    patch(setErrors, name, null);
    patch(setOutcomes, name, action === "approve" ? "approved" : "rejected");
    try {
      const res = await fetch(`/inquiry-api/wfh/${encodeURIComponent(name)}/${action}`, { method: "POST" });
      if (!res.ok) throw new Error(`${action} ${res.status}: ${await res.text()}`);
      // Update the sidebar badge straight away
      void queryClient.invalidateQueries({ queryKey: ["wfh-pending-count"] });
      // Leave the result visible for a moment, then reload so the row moves out of Pending
      clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const refreshed = await load();
        // If the reload failed, keep the shown results so decided rows don't look pending again
        if (!refreshed || !alive.current) return;
        setOutcomes((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => inFlight.current.has(k))));
      }, 1200);
    } catch (err) {
      console.error("wfh_decision_failed", { name, action, err });
      if (alive.current) {
        patch(setOutcomes, name, null);
        patch(setErrors, name, `Could not ${action} this request. It may not have saved \u2014 refresh and check.`);
      }
    } finally {
      inFlight.current.delete(name);
      if (alive.current) setProcessing(new Set(inFlight.current));
    }
  }

  return { requests, loading, loadError, refreshFailed, retry, outcomes, errors, processing, decide };
}
