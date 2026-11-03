import { useQuery } from "@tanstack/react-query";
import type { OverviewData } from "@/components/dashboard/financialOverview";

/** One year of figures from GET /inquiry-api/financial-overview (all maths is done by the backend). */
export function useFinancialOverview(year: number) {
  return useQuery({
    queryKey: ["financial-overview", year],
    queryFn: async () => {
      try {
        const r = await fetch(`/inquiry-api/financial-overview?year=${year}`, { credentials: "include" });
        if (!r.ok) throw new Error(`financial-overview returned ${r.status}`);
        return (await r.json()) as OverviewData;
      } catch (err) {
        console.error("financial overview failed", { year, err });
        throw err;
      }
    },
  });
}
