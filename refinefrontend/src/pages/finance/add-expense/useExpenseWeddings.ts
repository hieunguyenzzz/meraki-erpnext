import { useMemo } from "react";
import { useGetIdentity } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";
import { useMyEmployee } from "@/hooks/useMyEmployee";
import type { ExpenseWedding } from "./defaults";

interface ApiWedding {
  id: string;
  project_name: string;
  wedding_date: string | null;
  venue_name: string | null;
  assigned: boolean;
}

async function fetchWeddings(): Promise<ApiWedding[]> {
  const res = await fetch("/inquiry-api/expense/weddings", { credentials: "include" });
  if (!res.ok) throw new Error(`Could not load weddings (${res.status})`);
  return (await res.json()).data;
}

/** Weddings the user may log an expense against; the backend applies the role rules. */
export function useExpenseWeddings() {
  const { employeeId, isLoading: employeeLoading } = useMyEmployee();
  const { data: identity } = useGetIdentity<{ email?: string }>();
  // Keyed by user so one person's list is never served to the next login on a shared device
  const { data, isLoading, error } = useQuery({
    queryKey: ["expense-weddings", identity?.email],
    queryFn: fetchWeddings,
  });

  return useMemo(() => {
    const weddings: ExpenseWedding[] = (data ?? []).map((w) => ({
      id: w.id, name: w.project_name, date: w.wedding_date, venue: w.venue_name,
    }));
    const assignedIds = new Set((data ?? []).filter((w) => w.assigned).map((w) => w.id));
    const assigned = weddings.filter((w) => assignedIds.has(w.id));
    return { weddings, assigned, loading: isLoading || employeeLoading, employeeId, error: error as Error | null };
  }, [data, isLoading, employeeLoading, employeeId, error]);
}
