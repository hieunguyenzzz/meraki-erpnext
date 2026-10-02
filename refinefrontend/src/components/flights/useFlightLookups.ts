import { useEffect, useMemo, useState } from "react";
import { useList } from "@refinedev/core";
import type { StaffOption } from "@/lib/projectKanban";
import type { Option } from "./types";

/** Staff (employee) and wedding (Project) options for the flight filters and the booking sheet. */
export function useFlightLookups() {
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [staffError, setStaffError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/inquiry-api/flights/staff", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))))
      .then((data: StaffOption[]) => setStaff(data))
      .catch((e) => {
        console.error("flights: staff lookup failed", e);
        setStaffError(`Could not load staff list (${e instanceof Error ? e.message : "error"})`);
      });
  }, []);

  const { result: projectsResult, query: projectsQuery } = useList({
    resource: "Project",
    pagination: { mode: "off" },
    meta: { fields: ["name", "project_name"] },
  });

  const projectOptions = useMemo<Option[]>(
    () =>
      ((projectsResult?.data ?? []) as { name: string; project_name: string }[]).map((p) => ({
        value: p.name,
        label: p.project_name || p.name,
      })),
    [projectsResult?.data],
  );

  const staffSelectOptions = useMemo<Option[]>(
    () => staff.map((s) => ({ value: s.id, label: s.name })),
    [staff],
  );

  const lookupError =
    staffError ?? (projectsQuery.isError ? "Could not load weddings list" : null);

  return { staff, staffSelectOptions, projectOptions, lookupError };
}
