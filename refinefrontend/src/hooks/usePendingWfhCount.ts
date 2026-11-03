import { useQuery } from "@tanstack/react-query";

/** Pending work-from-home requests (HR only), from GET /inquiry-api/wfh/pending-count. */
export function usePendingWfhCount(enabled: boolean) {
  const { data } = useQuery({
    queryKey: ["wfh-pending-count"],
    enabled,
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<number> => {
      const res = await fetch("/inquiry-api/wfh/pending-count", { credentials: "include" });
      if (!res.ok) throw new Error(`wfh pending-count failed: ${res.status}`);
      const json = (await res.json()) as { count?: number };
      return json.count ?? 0;
    },
  });
  return data ?? 0;
}
