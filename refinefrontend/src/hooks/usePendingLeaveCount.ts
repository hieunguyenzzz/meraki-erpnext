import { useEffect } from "react";
import { useList } from "@refinedev/core";

/** Open leave applications awaiting a decision. One page-size-1 list: the data provider returns the total via get_count. */
export function usePendingLeaveCount(enabled: boolean) {
  const { result, query } = useList({
    resource: "Leave Application",
    pagination: { currentPage: 1, pageSize: 1 },
    filters: [
      { field: "docstatus", operator: "eq", value: 0 },
      { field: "status", operator: "eq", value: "Open" },
    ],
    meta: { fields: ["name"] },
    queryOptions: { enabled, staleTime: 60_000, refetchInterval: 60_000 },
  });
  // Log a failed count once per failure streak instead of silently showing 0
  useEffect(() => {
    if (query.isError) console.error("pending leave count failed", query.error);
  }, [query.isError, query.error]);
  return result?.total ?? 0;
}
