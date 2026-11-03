import { useMemo } from "react";
import { useList } from "@refinedev/core";
import type { PayrollEntry } from "./types";

/** All payroll entries (newest first), used for the month picker and to find the selected month's entry. */
export function usePayrollEntries() {
  const { result, query } = useList({
    resource: "Payroll Entry",
    pagination: { mode: "off" },
    sorters: [{ field: "start_date", order: "desc" }],
    meta: { fields: ["name", "posting_date", "start_date", "end_date", "docstatus", "status", "number_of_employees"] },
  });
  const entries = useMemo(() => (result?.data ?? []) as PayrollEntry[], [result?.data]);
  return { entries, loaded: !query.isLoading };
}
