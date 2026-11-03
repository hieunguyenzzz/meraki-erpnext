import { useMemo } from "react";
import { useList } from "@refinedev/core";

export interface MyTask {
  name: string;
  subject: string;
  project: string | null;
  project_name: string | null;
  exp_end_date: string | null;
}

/** Open tasks assigned to, shared with, or created by the signed-in user. */
export function useMyTasks(email: string | undefined, employeeId: string | null) {
  const { result, query } = useList({
    resource: "Task",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "nin", value: ["Completed", "Cancelled"] }],
    sorters: [{ field: "exp_end_date", order: "asc" }],
    meta: { fields: ["name", "subject", "project", "exp_end_date", "_assign", "custom_shared_with", "owner"] },
  });
  const all = result?.data ?? [];

  const { result: projectsResult } = useList({
    resource: "Project",
    pagination: { mode: "off" },
    meta: { fields: ["name", "project_name"] },
    queryOptions: { enabled: all.length > 0 },
  });
  const projects = projectsResult?.data;

  const tasks = useMemo<MyTask[]>(() => {
    if (!email) return [];
    const projectName = new Map((projects ?? []).map((p: any) => [p.name, p.project_name || p.name]));
    return all
      .filter((task: any) => {
        let isAssigned = false;
        try {
          isAssigned = (JSON.parse(task._assign || "[]") as string[]).includes(email);
        } catch {
          isAssigned = false;
        }
        const shared = employeeId ? (task.custom_shared_with?.split(",").map((s: string) => s.trim()) ?? []) : [];
        return isAssigned || shared.includes(employeeId) || task.owner === email;
      })
      .map((task: any) => ({
        name: task.name,
        subject: task.subject,
        project: task.project ?? null,
        project_name: task.project ? (projectName.get(task.project) ?? null) : null,
        exp_end_date: task.exp_end_date ?? null,
      }));
  }, [all, projects, email, employeeId]);

  return { tasks, isLoading: !!query?.isLoading };
}
