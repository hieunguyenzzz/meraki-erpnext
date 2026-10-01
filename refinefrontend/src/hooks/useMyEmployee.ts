import { useQuery } from "@tanstack/react-query";
import type { EmployeeProfile } from "@/lib/types";

// Fields returned by GET /inquiry-api/me/profile — kept in sync with
// PROFILE_FIELDS in webhook_v2/routers/me.py.

export function useMyEmployee() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["me-profile"],
    queryFn: async () => {
      const res = await fetch("/inquiry-api/me/profile", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load profile: ${res.status}`);
      return res.json() as Promise<{ data: EmployeeProfile }>;
    },
  });

  // Backend returns {data: {}} for sessions with no linked Employee (e.g.
  // Administrator) — normalize to null so callers' `!employee` checks behave
  // the same as before this hook talked to a dedicated endpoint.
  const employee = data?.data?.name ? data.data : null;

  return {
    employee,
    employeeId: employee?.name ?? null,
    isLoading,
    refetch,
  };
}
