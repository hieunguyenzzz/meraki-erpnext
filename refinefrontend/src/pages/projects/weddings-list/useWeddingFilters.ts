import { useMemo, useState } from "react";
import { useQueryState } from "nuqs";
import { yearVN } from "@/lib/businessTime";
import { PROJECT_COLUMNS, getProjectColumnKey, type ProjectColumnKey, type ProjectKanbanItem } from "@/lib/projectKanban";

export const ALL_YEARS = "all";

const STAFF_FIELDS = [
  "custom_lead_planner", "custom_support_planner",
  "custom_assistant_1", "custom_assistant_2", "custom_assistant_3",
  "custom_assistant_4", "custom_assistant_5",
] as const;

/** Search, stage, type, year and staff filters over the already-loaded weddings (all client-side). */
export function useWeddingFilters(items: ProjectKanbanItem[]) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<ProjectColumnKey | "">("");
  const [type, setType] = useState("");
  const [year, setYear] = useQueryState("year", { defaultValue: String(yearVN()), clearOnDefault: true });
  const [staff, setStaff] = useQueryState("staff", { defaultValue: "", clearOnDefault: true });

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    for (const item of items) {
      const y = item.expected_end_date?.slice(0, 4);
      if (y) years.add(y);
    }
    return [...years].sort().reverse();
  }, [items]);

  // Everything except the stage filter: the board shows all stages, the chips count against this.
  const unstaged = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((p) => {
      if (year !== ALL_YEARS && !p.expected_end_date?.startsWith(year)) return false;
      if (staff && !STAFF_FIELDS.some((f) => p[f] === staff)) return false;
      if (type && p.custom_wedding_type !== type) return false;
      if (q && !(p.customer_name ?? p.project_name ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, year, staff, type, query]);

  const stageCounts = useMemo(() => {
    const counts = Object.fromEntries(PROJECT_COLUMNS.map((c) => [c.key, 0])) as Record<ProjectColumnKey, number>;
    for (const p of unstaged) counts[getProjectColumnKey(p)] += 1;
    return counts;
  }, [unstaged]);

  const staged = useMemo(
    () => (stage ? unstaged.filter((p) => getProjectColumnKey(p) === stage) : unstaged),
    [unstaged, stage]
  );

  const isFiltered = !!(query.trim() || stage || type || staff || year !== String(yearVN()));

  return {
    query, setQuery,
    stage, setStage,
    type, setType,
    year, setYear,
    staff, setStaff,
    availableYears,
    unstaged,
    staged,
    stageCounts,
    isFiltered,
  };
}
