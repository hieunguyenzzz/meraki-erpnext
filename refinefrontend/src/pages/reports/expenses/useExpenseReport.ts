import { useCallback, useEffect, useState } from "react";
import type { ExpenseCategory, ExpenseRow, ExpenseSummary, Project } from "./types";

async function getJson(url: string) {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** Wedding list for the dropdowns. */
export function useWeddingList() {
  const [projects, setProjects] = useState<Project[] | null>(null);
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

  const retryList = useCallback(() => setAttempt((n) => n + 1), []);
  return { projects, listError, retryList };
}

/** Expenses of one wedding, or of every wedding ending in the year/month. */
export function useExpenseReport(year: string, month: string, project: string) {
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!project && !year) {
      setRows([]);
      setSummary(null);
      setCategories([]);
      return;
    }
    const ctrl = new AbortController();
    setIsLoading(true);
    const qs = new URLSearchParams(project ? { project } : { year, ...(month ? { month } : {}) });
    fetch(`/inquiry-api/reports/wedding-expenses?${qs}`, { credentials: "include", signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setRows(d.data ?? []);
        setSummary(d.summary ?? null);
        setCategories(d.categories ?? []);
        setError(null);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        console.error("Wedding expenses failed to load", e);
        setRows([]);
        setSummary(null);
        setCategories([]);
        setError(e);
      })
      .finally(() => { if (!ctrl.signal.aborted) setIsLoading(false); });
    return () => ctrl.abort();
  }, [year, month, project, attempt]);

  const retry = useCallback(() => { setError(null); setAttempt((n) => n + 1); }, []);
  return { rows, summary, categories, isLoading, error, retry };
}
