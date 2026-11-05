import { useCallback, useEffect, useMemo, useState } from "react";
import type { ExpenseCategory } from "@/components/projects/ExpenseCategorySummary";

/** Expense rows of one wedding (only loaded for roles that may see them). */
export function useWeddingExpenses(projectName: string, enabled: boolean) {
  const [expenses, setExpenses] = useState<any[]>([]);
  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/inquiry-api/expenses?project=${encodeURIComponent(projectName)}`, { credentials: "include" });
      if (res.ok) setExpenses(await res.json());
    } catch (err) {
      console.error("[wedding] expenses load failed", projectName, err);
      setExpenses([]);
    }
  }, [projectName]);
  useEffect(() => {
    if (projectName && enabled) refetch();
  }, [projectName, enabled, refetch]);

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  useEffect(() => {
    if (!enabled) return;
    fetch("/inquiry-api/expense/categories?scope=wedding")
      .then((r) => r.json())
      .then((d) => setCategories(d))
      .catch((err) => console.error("[wedding] expense categories load failed", err));
  }, [enabled]);

  const approvedTotal = useMemo(
    () => expenses.filter((e) => e.status === "Approved").reduce((sum, e) => sum + (e.amount || 0), 0),
    [expenses]
  );
  const pending = useMemo(() => expenses.filter((e) => e.status === "Pending"), [expenses]);
  return { expenses, refetch, approvedTotal, pending, categories, setCategories };
}
