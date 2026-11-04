import { useQuery } from "@tanstack/react-query";
import { HttpError, type MyWedding } from "@/hooks/useMyWeddings";
import { totalAnnualLeaveDays } from "@/lib/leaveBalance";

export interface HomeWedding extends MyWedding {
  guest_count?: number | null;
  /** Done vs total tasks on the wedding; null when it has no tasks. */
  checklist?: { done: number; total: number } | null;
}

export interface HomeTask {
  name: string;
  subject: string;
  project: string | null;
  project_name: string | null;
  exp_end_date: string | null;
  /** Days until due; negative = overdue. */
  due_in_days: number | null;
}

export interface PlannerHomeData {
  /** The caller is a planner with an Employee record, so weddings and leave apply. */
  has_weddings: boolean;
  next_wedding: HomeWedding | null;
  upcoming: MyWedding[];
  /** Raw leave balance rows; null when not applicable or the lookup failed (see leave_failed). */
  leave: Record<string, unknown>[] | null;
  leave_failed: boolean;
  /** Each section below is null when the caller's roles don't cover it. */
  open_leads: number | null;
  active_staff: number | null;
  latest_payslip: { name: string; start_date: string; net_pay: number } | null;
  tasks: { open_count: number; items: HomeTask[] };
}

export const PLANNER_HOME_KEY = ["home-planner"];

/** Everything the planner Home shows, in one call (GET /inquiry-api/home/planner). */
export function useHomePlanner() {
  return useQuery({
    queryKey: PLANNER_HOME_KEY,
    queryFn: async () => {
      const url = "/inquiry-api/home/planner";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        console.error("useHomePlanner: request failed", { url, status: res.status });
        throw new HttpError(res.status, url);
      }
      return (await res.json()) as PlannerHomeData;
    },
  });
}

/** "8.5 days" / "1 day"; "—" when the balance is unknown. */
export function leaveLeftLabel(rows: PlannerHomeData["leave"]): string {
  const days = totalAnnualLeaveDays(rows ?? undefined);
  if (days === null) return "—";
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export async function setTaskDone(task: string, done: boolean): Promise<void> {
  const url = `/inquiry-api/home/tasks/${encodeURIComponent(task)}/done`;
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ done }),
  });
  if (!res.ok) {
    console.error("setTaskDone: request failed", { url, done, status: res.status });
    throw new HttpError(res.status, url);
  }
}
