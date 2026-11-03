import { useCallback, useEffect, useMemo, useState } from "react";
import { useInvalidate, useList, useOne, usePermissions } from "@refinedev/core";
import { displayName } from "@/lib/format";
import { hasModuleAccess, FINANCE_ROLES, WEDDING_EXPENSE_ROLES, WEDDING_MANAGER_ROLES } from "@/lib/roles";
import { useMyEmployee } from "@/hooks/useMyEmployee";

export interface SOItem { name: string; item_code: string; item_name: string; qty: number; rate: number; amount: number }
export interface Employee { id: string; name: string; userId?: string }
export interface Supplier { name: string; supplier_name: string }
export interface AddOnCatalogItem { name: string; item_name: string; custom_include_in_commission?: number }

const PROJECT_FIELDS = [
  "name", "project_name", "status", "custom_project_stage", "customer", "expected_start_date", "expected_end_date",
  "sales_order", "custom_lead_planner", "custom_support_planner",
  "custom_assistant_1", "custom_assistant_2", "custom_assistant_3", "custom_assistant_4", "custom_assistant_5",
  "custom_lead_commission_pct", "custom_support_commission_pct", "custom_assistant_commission_pct",
  "custom_sales_person", "custom_booking_date", "custom_service_type", "custom_wedding_type",
  "custom_wedding_vendors", "custom_total_budget",
];

/** Everything the wedding page and its tabs read: the project, its sales order, payments, tasks, people and role flags. */
export function useWeddingData(name: string) {
  const invalidate = useInvalidate();
  const { data: roles } = usePermissions<string[]>({});
  const isFinance = hasModuleAccess(roles ?? [], FINANCE_ROLES);
  const isWeddingManager = hasModuleAccess(roles ?? [], WEDDING_MANAGER_ROLES);
  const { employeeId: myEmployeeId } = useMyEmployee();

  const { result: project, query: projectQuery } = useOne({ resource: "Project", id: name, meta: { fields: PROJECT_FIELDS } });

  const { result: salesOrder } = useOne({
    resource: "Sales Order",
    id: project?.sales_order!,
    meta: {
      fields: ["name", "customer_name", "grand_total", "custom_venue", "custom_commission_base", "delivery_date", "per_billed", "per_delivered", "status", "total_taxes_and_charges", "taxes"],
    },
    queryOptions: { enabled: !!project?.sales_order },
  });

  const { result: customer } = useOne({
    resource: "Customer",
    id: project?.customer!,
    meta: { fields: ["name", "customer_name", "mobile_no", "email_id"] },
    queryOptions: { enabled: !!project?.customer },
  });

  // Sales Order Item direct list returns 403, so items come from the parent SO doc.
  const [soItems, setSOItems] = useState<SOItem[]>([]);
  const fetchSOItems = useCallback(async (soName: string) => {
    try {
      const res = await fetch(`/api/resource/Sales Order/${encodeURIComponent(soName)}`, { credentials: "include" });
      const data = await res.json();
      setSOItems(data.data?.items ?? []);
    } catch {
      setSOItems([]);
    }
  }, []);
  useEffect(() => {
    if (project?.sales_order) fetchSOItems(project.sales_order);
  }, [project?.sales_order, fetchSOItems]);

  // Sales Invoices linked to this Project via the `project` field (sales_order is not filterable on Sales Invoice).
  const [invoices, setInvoices] = useState<any[]>([]);
  const fetchInvoices = useCallback(async (projectName: string) => {
    try {
      const fields = JSON.stringify(["name", "grand_total", "outstanding_amount", "status", "due_date", "posting_date"]);
      const filters = JSON.stringify([["project", "=", projectName]]);
      const res = await fetch(
        `/api/resource/Sales Invoice?filters=${encodeURIComponent(filters)}&fields=${encodeURIComponent(fields)}&limit=100`,
        { credentials: "include" }
      );
      const data = await res.json();
      setInvoices(data.data ?? []);
    } catch {
      setInvoices([]);
    }
  }, []);
  useEffect(() => {
    if (name) fetchInvoices(name);
  }, [name, fetchInvoices]);

  const { result: tasksResult } = useList({
    resource: "Task",
    pagination: { mode: "off" as const },
    filters: [{ field: "project", operator: "eq", value: name }],
    sorters: [{ field: "creation", order: "desc" }],
    meta: { fields: ["name", "subject", "status", "priority", "exp_end_date", "custom_wedding_phase", "_assign", "custom_shared_with", "owner"] },
    queryOptions: { enabled: !!name },
  });
  const tasks = tasksResult?.data ?? [];

  // The directory endpoint resolves names for restricted roles; direct Employee listing only returns the caller's own record.
  const [employeeDirectory, setEmployeeDirectory] = useState<any[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/inquiry-api/employees/directory", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((json) => { if (!cancelled) setEmployeeDirectory(json.data ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const employees: Employee[] = useMemo(
    () => employeeDirectory.map((e: any) => ({ id: e.name, name: displayName(e), userId: e.user_id })),
    [employeeDirectory]
  );
  const getEmployeeName = useCallback(
    (id: string | null | undefined) => (id ? employees.find((e) => e.id === id)?.name || id : null),
    [employees]
  );

  const { result: venuesResult } = useList({
    resource: "Supplier",
    pagination: { mode: "off" as const },
    filters: [
      { field: "supplier_group", operator: "eq", value: "Wedding Venues" },
      { field: "disabled", operator: "eq", value: 0 },
    ],
    meta: { fields: ["name", "supplier_name"] },
  });
  const venues = (venuesResult?.data ?? []) as Supplier[];

  const { result: allSuppliersResult } = useList({
    resource: "Supplier",
    pagination: { mode: "off" as const },
    meta: { fields: ["name", "supplier_name"] },
  });
  const allSuppliers = useMemo(() => (allSuppliersResult?.data ?? []) as Supplier[], [allSuppliersResult?.data]);

  // Add-on catalogue comes from the backend (direct Item read returns 403).
  const [availableAddOns, setAvailableAddOns] = useState<AddOnCatalogItem[]>([]);
  const fetchAddonItems = useCallback(async () => {
    try {
      const res = await fetch("/inquiry-api/wedding/addon-items", { credentials: "include" });
      const json = await res.json();
      const items = json.data ?? [];
      setAvailableAddOns(items);
      return items as AddOnCatalogItem[];
    } catch {
      setAvailableAddOns([]);
      return [] as AddOnCatalogItem[];
    }
  }, []);
  useEffect(() => { fetchAddonItems(); }, [fetchAddonItems]);

  const addOnItems = useMemo(() => {
    const codes = new Set(availableAddOns.map((a) => a.name));
    return soItems.filter((i) => codes.has(i.item_code));
  }, [soItems, availableAddOns]);

  const teamIds = useMemo(() => {
    if (!project) return { lead: null, support: null, assistants: [] as string[], all: [] as string[] };
    const assistants = [project.custom_assistant_1, project.custom_assistant_2, project.custom_assistant_3, project.custom_assistant_4, project.custom_assistant_5].filter(Boolean) as string[];
    const all = [project.custom_lead_planner, project.custom_support_planner, ...assistants].filter(Boolean) as string[];
    return { lead: (project.custom_lead_planner as string) || null, support: (project.custom_support_planner as string) || null, assistants, all };
  }, [project]);

  const isOnTeam = !!myEmployeeId && teamIds.all.includes(myEmployeeId);
  const showExpensesTab = isFinance || isOnTeam || hasModuleAccess(roles ?? [], WEDDING_EXPENSE_ROLES);

  const weddingDate: string | undefined = project?.expected_end_date || salesOrder?.delivery_date;
  const venueName: string | undefined = salesOrder?.custom_venue;
  const totalValue: number = salesOrder?.grand_total || 0;
  const customerName: string = customer?.customer_name || salesOrder?.customer_name || project?.project_name || "";

  const totalInvoiced = invoices.reduce((sum: number, inv: any) => sum + (inv.grand_total || 0), 0);
  const totalOutstanding = invoices.reduce((sum: number, inv: any) => sum + (inv.outstanding_amount || 0), 0);
  const totalPaid = totalInvoiced - totalOutstanding;
  const paidPct = totalValue > 0 ? Math.round((totalPaid / totalValue) * 100) : 0;

  const refreshProject = useCallback(() => {
    invalidate({ resource: "Project", invalidates: ["detail"], id: name });
  }, [invalidate, name]);

  return {
    name, project, projectQuery, salesOrder, customer, soItems, fetchSOItems, invoices, fetchInvoices,
    tasks, employees, getEmployeeName, venues, allSuppliers, availableAddOns, fetchAddonItems, addOnItems,
    teamIds, isFinance, isWeddingManager, showExpensesTab,
    weddingDate, venueName, totalValue, customerName,
    totalInvoiced, totalOutstanding, totalPaid, paidPct, refreshProject,
  };
}

export type WeddingData = ReturnType<typeof useWeddingData>;
