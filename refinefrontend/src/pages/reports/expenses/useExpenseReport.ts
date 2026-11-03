import { useCallback, useEffect, useState } from "react";
import type { ExpenseRow, ExpenseSummary, Project } from "./types";

async function getJson(url: string) {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** Wedding list for the dropdowns, plus the expenses of the selected wedding. */
export function useExpenseReport(project: string) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [listError, setListError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    getJson("/inquiry-api/reports/wedding-expenses/projects")
      .then((d) => { setProjects(d.data ?? []); setListError(null); })
      .catch((e) => {
        console.error("Wedding list failed to load", e);
        setListError(e);
        setProjects([]);
      });
  }, [attempt]);

  useEffect(() => {
    if (!project) {
      setRows([]);
      setSummary(null);
      return;
    }
    const ctrl = new AbortController();
    setIsLoading(true);
    fetch(`/inquiry-api/reports/wedding-expenses?project=${encodeURIComponent(project)}`, { credentials: "include", signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setRows(d.data ?? []);
        setSummary(d.summary ?? null);
        setError(null);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        console.error("Wedding expenses failed to load", e);
        setRows([]);
        setSummary(null);
        setError(e);
      })
      .finally(() => { if (!ctrl.signal.aborted) setIsLoading(false); });
    return () => ctrl.abort();
  }, [project, attempt]);

  const retry = useCallback(() => { setError(null); setListError(null); setAttempt((n) => n + 1); }, []);
  return { projects, rows, summary, isLoading, error, listError, retry };
}
