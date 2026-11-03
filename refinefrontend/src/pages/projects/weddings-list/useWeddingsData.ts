import { useCallback, useEffect, useState } from "react";
import type { ProjectKanbanItem, StaffOption } from "@/lib/projectKanban";

// Planner field -> the field holding its display name, so an inline edit patches both.
const NAME_FIELD: Record<string, keyof ProjectKanbanItem> = {
  custom_lead_planner: "lead_planner_name",
  custom_support_planner: "support_planner_name",
  custom_assistant_1: "assistant_1_name",
  custom_assistant_2: "assistant_2_name",
  custom_assistant_3: "assistant_3_name",
};

/** Loads the wedding list (one backend call) and exposes a patcher for inline planner edits. */
export function useWeddingsData() {
  const [items, setItems] = useState<ProjectKanbanItem[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetch("/inquiry-api/projects/kanban", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`/inquiry-api/projects/kanban returned ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setItems(data?.data ?? []);
        setStaffOptions(data?.staff ?? []);
      })
      .catch((err) => {
        console.error("Load weddings failed", err);
        if (!cancelled) setError(err instanceof Error ? err.message : "Request failed");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const patchPlanner = useCallback((projectId: string, field: string, newId: string | null, newName: string) => {
    const nameField = NAME_FIELD[field];
    setItems((prev) =>
      prev.map((p) =>
        p.id === projectId ? { ...p, [field]: newId ?? undefined, [nameField]: newName || undefined } : p
      )
    );
  }, []);

  return { items, staffOptions, isLoading, error, reload, patchPlanner };
}
