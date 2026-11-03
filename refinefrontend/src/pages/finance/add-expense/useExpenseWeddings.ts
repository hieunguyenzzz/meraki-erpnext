import { useMemo } from "react";
import { useList, usePermissions } from "@refinedev/core";
import { useMyEmployee } from "@/hooks/useMyEmployee";
import { useMyWeddings } from "@/hooks/useMyWeddings";
import { hasModuleAccess, isEmployeeSelfServiceOnly, FINANCE_ROLES, WEDDING_EXPENSE_ROLES } from "@/lib/roles";
import type { ExpenseWedding } from "./defaults";

const ASSIGNMENT_FIELDS = [
  "custom_lead_planner", "custom_support_planner",
  "custom_assistant_1", "custom_assistant_2", "custom_assistant_3",
  "custom_assistant_4", "custom_assistant_5",
] as const;

/**
 * Weddings the user may log an expense against (existing role rules), plus the
 * subset they are personally assigned to (used for the default pick).
 */
export function useExpenseWeddings() {
  const { employeeId, isLoading: employeeLoading } = useMyEmployee();
  const { data: roles } = usePermissions<string[]>({});
  const rolesKnown = !!roles;
  const selfServiceOnly = rolesKnown && isEmployeeSelfServiceOnly(roles);
  const seesAll = hasModuleAccess(roles ?? [], FINANCE_ROLES) || hasModuleAccess(roles ?? [], WEDDING_EXPENSE_ROLES);

  const { result, query } = useList<Record<string, string>>({
    resource: "Project",
    filters: [{ field: "status", operator: "eq", value: "Open" }],
    pagination: { mode: "off" },
    meta: { fields: ["name", "project_name", "status", "expected_end_date", ...ASSIGNMENT_FIELDS] },
    // Employee-only staff get their weddings from one scoped backend call instead
    queryOptions: { enabled: rolesKnown && !selfServiceOnly },
  });
  const mine = useMyWeddings(selfServiceOnly);

  return useMemo(() => {
    const isMine = (p: Record<string, string>) => !!employeeId && ASSIGNMENT_FIELDS.some((f) => p[f] === employeeId);
    let weddings: ExpenseWedding[];
    let assigned: ExpenseWedding[];
    if (selfServiceOnly) {
      weddings = mine.weddings.map((w) => ({ id: w.id, name: w.project_name, date: w.wedding_date, venue: w.venue_name }));
      assigned = weddings;
    } else {
      const all = result?.data ?? [];
      const toWedding = (p: Record<string, string>) => ({ id: p.name, name: p.project_name, date: p.expected_end_date || null });
      weddings = (seesAll ? all : all.filter(isMine)).map(toWedding);
      assigned = all.filter(isMine).map(toWedding);
    }
    const loading = !rolesKnown || employeeLoading || (selfServiceOnly ? mine.isLoading : query.isLoading);
    return { weddings, assigned, loading, employeeId };
  }, [result, mine.weddings, mine.isLoading, query.isLoading, selfServiceOnly, seesAll, rolesKnown, employeeId, employeeLoading]);
}
