import { useState, useEffect } from "react";
import { useList, useCustomMutation, useInvalidate, useApiUrl } from "@refinedev/core";
import type { ColumnDef } from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";
import { formatVND, formatDate } from "@/lib/format";
import { extractErrorMessage } from "@/lib/errors";

function now() { return new Date(); }
function monthLabel(d: Date) { return d.toLocaleDateString("en-US", { month: "long", year: "numeric" }); }
function firstOfMonth(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; }
function endOfMonth(d: Date) {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}
function docstatusLabel(ds: number) { return ds === 0 ? "Draft" : ds === 1 ? "Submitted" : ds === 2 ? "Cancelled" : "Unknown"; }
function docstatusBadge(ds: number) { return ds === 1 ? "success" as const : ds === 2 ? "destructive" as const : "secondary" as const; }

interface SalarySlipEarning {
  salary_component: string;
  amount: number;
}

interface SalarySlip {
  name: string;
  modified?: string;
  employee: string;
  employee_name: string;
  gross_pay: number;
  total_deduction: number;
  net_pay: number;
  posting_date: string;
  docstatus: number;
  earnings: SalarySlipEarning[];
  deductions: SalarySlipEarning[];
}

function getEarningAmount(earnings: SalarySlipEarning[] | undefined, component: string): number {
  return earnings?.find(e => e.salary_component === component)?.amount ?? 0;
}

function getTotalCommission(earnings: SalarySlipEarning[] | undefined): number {
  const commissionComponents = ["Assistant Commission", "Support Planner Commission", "Lead Planner Commission"];
  return earnings?.filter(e => commissionComponents.includes(e.salary_component))
    .reduce((sum, e) => sum + e.amount, 0) ?? 0;
}

function getDeductionAmount(deductions: SalarySlipEarning[] | undefined, component: string): number {
  return deductions?.find(e => e.salary_component === component)?.amount ?? 0;
}

function getEmployerBHXH(deductions: SalarySlipEarning[] | undefined): number {
  const bhxh = getDeductionAmount(deductions, "BHXH (Employee)");
  const bhyt = getDeductionAmount(deductions, "BHYT (Employee)");
  const bhtn = getDeductionAmount(deductions, "BHTN (Employee)");
  const employeeTotal = bhxh + bhyt + bhtn;
  // Employee pays 10.5%, employer pays 21.5%
  return employeeTotal > 0 ? Math.round(employeeTotal / 10.5 * 21.5) : 0;
}

interface PayrollEntry {
  name: string;
  posting_date: string;
  start_date: string;
  end_date: string;
  docstatus: number;
  status: string;
  number_of_employees: number;
}

const slipColumns: ColumnDef<SalarySlip, unknown>[] = [
  {
    accessorKey: "employee_name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Employee" />,
    cell: ({ row }) => <span className="font-medium">{row.original.employee_name}</span>,
    filterFn: "includesString",
  },
  {
    id: "base",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Base" className="text-right" />,
    cell: ({ row }) => <div className="text-right">{formatVND(getEarningAmount(row.original.earnings, "Basic Salary"))}</div>,
  },
  {
    id: "commission",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Commission" className="text-right" />,
    cell: ({ row }) => <div className="text-right">{formatVND(getTotalCommission(row.original.earnings))}</div>,
  },
  {
    id: "bonus",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Bonus" className="text-right" />,
    cell: ({ row }) => <div className="text-right">{formatVND(getEarningAmount(row.original.earnings, "Bonus"))}</div>,
  },
  {
    accessorKey: "gross_pay",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Gross Pay" className="text-right" />,
    cell: ({ row }) => <div className="text-right">{formatVND(row.original.gross_pay)}</div>,
  },
  {
    id: "bhxh",
    header: ({ column }) => <DataTableColumnHeader column={column} title="BHXH 8%" className="text-right" />,
    cell: ({ row }) => <div className="text-right text-muted-foreground">{formatVND(getDeductionAmount(row.original.deductions, "BHXH (Employee)"))}</div>,
  },
  {
    id: "bhyt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="BHYT 1.5%" className="text-right" />,
    cell: ({ row }) => <div className="text-right text-muted-foreground">{formatVND(getDeductionAmount(row.original.deductions, "BHYT (Employee)"))}</div>,
  },
  {
    id: "bhtn",
    header: ({ column }) => <DataTableColumnHeader column={column} title="BHTN 1%" className="text-right" />,
    cell: ({ row }) => <div className="text-right text-muted-foreground">{formatVND(getDeductionAmount(row.original.deductions, "BHTN (Employee)"))}</div>,
  },
  {
    id: "employer_bhxh",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Employer BHXH" className="text-right" />,
    cell: ({ row }) => <div className="text-right text-amber-600 dark:text-amber-400">{formatVND(getEmployerBHXH(row.original.deductions))}</div>,
  },
  {
    accessorKey: "net_pay",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Net Pay" className="text-right" />,
    cell: ({ row }) => <div className="text-right">{formatVND(row.original.net_pay)}</div>,
  },
  {
    accessorKey: "docstatus",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => (
      <Badge variant={docstatusBadge(row.original.docstatus)}>
        {docstatusLabel(row.original.docstatus)}
      </Badge>
    ),
  },
];

const historyColumns: ColumnDef<PayrollEntry, unknown>[] = [
  {
    accessorKey: "start_date",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Period" />,
    cell: ({ row }) => <span className="font-medium">{formatDate(row.original.start_date)} - {formatDate(row.original.end_date)}</span>,
  },
  {
    accessorKey: "number_of_employees",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Employees" className="text-right" />,
    cell: ({ row }) => <div className="text-right">{row.original.number_of_employees ?? "-"}</div>,
  },
  {
    accessorKey: "docstatus",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => (
      <Badge variant={docstatusBadge(row.original.docstatus)}>
        {row.original.status || docstatusLabel(row.original.docstatus)}
      </Badge>
    ),
  },
  {
    accessorKey: "posting_date",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Posted" />,
    cell: ({ row }) => formatDate(row.original.posting_date),
  },
];

export default function PayrollPage() {
  const today = now();
  const start = firstOfMonth(today);
  const end = endOfMonth(today);

  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [calculatingCommissions, setCalculatingCommissions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailedSlips, setDetailedSlips] = useState<SalarySlip[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);

  const apiUrl = useApiUrl();
  const invalidate = useInvalidate();
  const { mutateAsync: customMutation } = useCustomMutation();

  const { result: peResult, query: peQuery } = useList({
    resource: "Payroll Entry",
    pagination: { mode: "off" },
    filters: [
      { field: "start_date", operator: "eq", value: start },
      { field: "company", operator: "eq", value: "Meraki Wedding Planner" },
    ],
    sorters: [{ field: "creation", order: "desc" }],
    meta: { fields: ["name", "posting_date", "start_date", "end_date", "docstatus", "status", "number_of_employees"] },
  });

  const payrollEntries = peResult?.data ?? [];
  const currentPE = payrollEntries.length > 0 ? (payrollEntries[0] as any) : null;

  const { result: slipsResult, query: slipsQuery } = useList({
    resource: "Salary Slip",
    pagination: { mode: "off" },
    filters: currentPE
      ? [{ field: "payroll_entry", operator: "eq", value: currentPE.name }]
      : [{ field: "name", operator: "eq", value: "__never__" }],
    sorters: [{ field: "employee_name", order: "asc" }],
    meta: { fields: ["name", "employee", "employee_name", "gross_pay", "total_deduction", "net_pay", "posting_date", "docstatus"] },
    queryOptions: { enabled: !!currentPE },
  });

  const basicSlips = (slipsResult?.data ?? []) as SalarySlip[];

  // Fetch detailed salary slips with earnings child table
  useEffect(() => {
    async function fetchDetails() {
      if (basicSlips.length === 0) {
        setDetailedSlips([]);
        return;
      }

      setLoadingDetails(true);
      try {
        const detailed = await Promise.all(
          basicSlips.map(async (slip) => {
            const res = await fetch(`${apiUrl}/resource/Salary Slip/${slip.name}`, {
              credentials: "include",
            });
            const data = await res.json();
            return {
              ...slip,
              docstatus: data.data?.docstatus ?? slip.docstatus,
              modified: data.data?.modified ?? slip.modified,
              earnings: data.data?.earnings ?? [],
              deductions: data.data?.deductions ?? [],
              total_deduction: data.data?.total_deduction ?? slip.total_deduction ?? 0,
            };
          })
        );
        setDetailedSlips(detailed);
      } catch (err) {
        console.error("Failed to fetch salary slip details:", err);
        setDetailedSlips(basicSlips);
      } finally {
        setLoadingDetails(false);
      }
    }

    fetchDetails();
  }, [basicSlips.map(s => s.name).join(","), apiUrl, detailRefreshKey]);

  const salarySlips = detailedSlips.length > 0 ? detailedSlips : basicSlips;
  const hasDraftSlips = salarySlips.some((s) => s.docstatus === 0);
  const allSlipsSubmitted = currentPE && salarySlips.length > 0 && salarySlips.every((s) => s.docstatus === 1);

  const { result: histResult } = useList({
    resource: "Payroll Entry",
    pagination: { mode: "off" },
    sorters: [{ field: "posting_date", order: "desc" }],
    meta: { fields: ["name", "posting_date", "start_date", "end_date", "docstatus", "status", "number_of_employees"] },
  });

  const allEntries = (histResult?.data ?? []) as PayrollEntry[];

  const { result: empResult } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "eq", value: "Active" }],
    meta: { fields: ["name"] },
  });

  const activeCount = empResult?.data?.length ?? 0;

  const COMMISSION_COMPONENTS = ["Lead Planner Commission", "Support Planner Commission", "Assistant Commission"];

  async function calculateAndApplyCommissions(peId: string) {
    // Step 1: Fetch submitted Sales Orders with delivery_date in this period
    const soFilters = JSON.stringify([["delivery_date", "between", [start, end]], ["docstatus", "=", 1]]);
    const soFields = JSON.stringify(["name", "net_total", "custom_commission_base"]);
    const soRes = await fetch(`${apiUrl}/resource/Sales%20Order?filters=${encodeURIComponent(soFilters)}&fields=${encodeURIComponent(soFields)}&limit_page_length=500`, { credentials: "include" });
    const soData = await soRes.json();
    const salesOrders: { name: string; net_total: number; custom_commission_base?: number }[] = soData.data ?? [];

    // Step 2: Fetch Projects linked to those SOs
    const soNames = salesOrders.map(so => so.name);
    let projects: { name: string; sales_order: string; custom_lead_planner: string; custom_support_planner: string; custom_assistant_1: string; custom_assistant_2: string }[] = [];
    if (soNames.length > 0) {
      const projFilters = JSON.stringify([["sales_order", "in", soNames]]);
      const projFields = JSON.stringify(["name", "sales_order", "custom_lead_planner", "custom_support_planner", "custom_assistant_1", "custom_assistant_2"]);
      const projRes = await fetch(`${apiUrl}/resource/Project?filters=${encodeURIComponent(projFilters)}&fields=${encodeURIComponent(projFields)}&limit_page_length=500`, { credentials: "include" });
      const projData = await projRes.json();
      projects = projData.data ?? [];
    }

    // Step 3: Fetch draft salary slips for this payroll entry
    const slipFilters = JSON.stringify([["payroll_entry", "=", peId], ["docstatus", "=", 0]]);
    const slipFields = JSON.stringify(["name", "employee"]);
    const slipsRes = await fetch(`${apiUrl}/resource/Salary%20Slip?filters=${encodeURIComponent(slipFilters)}&fields=${encodeURIComponent(slipFields)}&limit_page_length=200`, { credentials: "include" });
    const slipsData = await slipsRes.json();
    const slips: { name: string; employee: string }[] = slipsData.data ?? [];

    if (slips.length === 0) return;

    // Step 4: Fetch employee commission percentages
    const employeeIds = slips.map(s => s.employee);
    const empFilters = JSON.stringify([["name", "in", employeeIds]]);
    const empFields = JSON.stringify(["name", "custom_lead_commission_pct", "custom_support_commission_pct", "custom_assistant_commission_pct"]);
    const empRes = await fetch(`${apiUrl}/resource/Employee?filters=${encodeURIComponent(empFilters)}&fields=${encodeURIComponent(empFields)}&limit_page_length=200`, { credentials: "include" });
    const empData = await empRes.json();
    const employees: { name: string; custom_lead_commission_pct: number; custom_support_commission_pct: number; custom_assistant_commission_pct: number }[] = empData.data ?? [];

    const empCommMap: Record<string, { lead: number; support: number; assistant: number }> = {};
    for (const emp of employees) {
      empCommMap[emp.name] = {
        lead: emp.custom_lead_commission_pct ?? 0,
        support: emp.custom_support_commission_pct ?? 0,
        assistant: emp.custom_assistant_commission_pct ?? 0,
      };
    }

    // Step 5: Build commission totals per employee
    const soNetMap: Record<string, number> = {};
    for (const so of salesOrders) soNetMap[so.name] = so.custom_commission_base ?? so.net_total ?? 0;

    const commTotals: Record<string, { lead: number; support: number; assistant: number }> = {};
    const addComm = (empId: string, type: "lead" | "support" | "assistant", netTotal: number) => {
      if (!empId) return;
      if (!commTotals[empId]) commTotals[empId] = { lead: 0, support: 0, assistant: 0 };
      const pct = empCommMap[empId]?.[type] ?? 0;
      commTotals[empId][type] += netTotal * pct / 100;
    };
    for (const proj of projects) {
      const netTotal = soNetMap[proj.sales_order] ?? 0;
      if (netTotal === 0) continue;
      addComm(proj.custom_lead_planner, "lead", netTotal);
      addComm(proj.custom_support_planner, "support", netTotal);
      addComm(proj.custom_assistant_1, "assistant", netTotal);
      addComm(proj.custom_assistant_2, "assistant", netTotal);
    }

    // Step 6: Update each draft salary slip with commission rows
    for (const slip of slips) {
      const fullSlipRes = await fetch(`${apiUrl}/resource/Salary%20Slip/${slip.name}`, { credentials: "include" });
      const fullSlipData = await fullSlipRes.json();
      const currentEarnings: SalarySlipEarning[] = fullSlipData.data?.earnings ?? [];
      const currentDeductions: SalarySlipEarning[] = fullSlipData.data?.deductions ?? [];

      const nonCommEarnings = currentEarnings.filter(e => !COMMISSION_COMPONENTS.includes(e.salary_component));
      const totals = commTotals[slip.employee];
      const newEarnings = [...nonCommEarnings];
      if (totals) {
        if (totals.lead > 0) newEarnings.push({ salary_component: "Lead Planner Commission", amount: Math.round(totals.lead) });
        if (totals.support > 0) newEarnings.push({ salary_component: "Support Planner Commission", amount: Math.round(totals.support) });
        if (totals.assistant > 0) newEarnings.push({ salary_component: "Assistant Commission", amount: Math.round(totals.assistant) });
      }

      await fetch(`${apiUrl}/resource/Salary%20Slip/${slip.name}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ earnings: newEarnings, deductions: currentDeductions }),
      });
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      // Step 1: Create Payroll Entry
      const createRes = await customMutation({
        url: "/api/resource/Payroll Entry", method: "post",
        values: { payroll_frequency: "Monthly", posting_date: end, start_date: start, end_date: end, company: "Meraki Wedding Planner", currency: "VND", exchange_rate: 1, cost_center: "Main - MWP", payment_account: "Cash - MWP", payroll_payable_account: "Payroll Payable - MWP" },
      });
      const peId = (createRes as any)?.data?.data?.name;
      if (!peId) throw new Error("Failed to create Payroll Entry");

      // Step 2: Fill Employee Details
      const fillRes = await customMutation({ url: "/api/method/run_doc_method", method: "post", values: { dt: "Payroll Entry", dn: peId, method: "fill_employee_details" } });
      const updatedDoc = (fillRes as any)?.data?.docs?.[0];
      if (!updatedDoc) throw new Error("Failed to fill employee details");
      await customMutation({ url: `/api/resource/Payroll Entry/${peId}`, method: "put", values: updatedDoc });

      // Step 3: Create Salary Slips
      await customMutation({ url: "/api/method/run_doc_method", method: "post", values: { dt: "Payroll Entry", dn: peId, method: "create_salary_slips" } });

      // Step 4: Calculate Commissions
      setCalculatingCommissions(true);
      await calculateAndApplyCommissions(peId);
      setCalculatingCommissions(false);
      setDetailRefreshKey(k => k + 1);

      invalidate({ resource: "Payroll Entry", invalidates: ["list"] });
      invalidate({ resource: "Salary Slip", invalidates: ["list"] });
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to generate payroll"));
      setCalculatingCommissions(false);
    } finally { setGenerating(false); }
  }

  async function handleRecalculate() {
    if (!currentPE) return;
    setCalculatingCommissions(true);
    setError(null);
    try {
      // Delete all draft salary slips so ERPNext regenerates them fresh,
      // picking up the latest custom_insurance_salary from each Employee.
      const slipFilters = JSON.stringify([["payroll_entry", "=", currentPE.name], ["docstatus", "=", 0]]);
      const existingRes = await fetch(`${apiUrl}/resource/Salary%20Slip?filters=${encodeURIComponent(slipFilters)}&fields=%5B%22name%22%5D&limit_page_length=200`, { credentials: "include" });
      const existingData = await existingRes.json();
      for (const slip of (existingData.data ?? [])) {
        await fetch(`${apiUrl}/resource/Salary%20Slip/${encodeURIComponent(slip.name)}`, { method: "DELETE", credentials: "include" });
      }

      // Regenerate salary slips — ERPNext evaluates BHXH formulas against Employee data
      await customMutation({ url: "/api/method/run_doc_method", method: "post", values: { dt: "Payroll Entry", dn: currentPE.name, method: "create_salary_slips" } });

      // Apply commission earnings on top
      await calculateAndApplyCommissions(currentPE.name);
      invalidate({ resource: "Salary Slip", invalidates: ["list"] });
      setDetailRefreshKey(k => k + 1);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to recalculate commissions"));
    } finally { setCalculatingCommissions(false); }
  }

  async function handleSubmitAll() {
    if (!currentPE) return;
    setSubmitting(true);
    setError(null);
    const errors: string[] = [];
    try {
      const draftSlips = salarySlips.filter(s => s.docstatus === 0);
      for (const slip of draftSlips) {
        try {
          const fullDocRes = await fetch(`${apiUrl}/resource/Salary Slip/${encodeURIComponent(slip.name)}`, { credentials: "include" });
          const fullDocData = await fullDocRes.json();
          // Skip if already submitted (stale local state)
          if (fullDocData.data?.docstatus !== 0) continue;
          await customMutation({
            url: "/api/method/frappe.client.submit",
            method: "post",
            values: { doc: fullDocData.data },
          });
        } catch (slipErr) {
          errors.push(`${slip.employee_name}: ${extractErrorMessage(slipErr, "submission failed")}`);
        }
      }
      if (errors.length > 0) {
        setError(errors.join(" | "));
      } else {
        // All slips submitted — create accrual JV to post GL entries
        try {
          await customMutation({
            url: "/api/method/create_payroll_accrual_jv",
            method: "post",
            values: { payroll_entry: currentPE.name },
          });
        } catch (peErr) {
          setError(`Slips submitted but GL posting failed: ${extractErrorMessage(peErr, "")}`);
        }
      }
    } finally {
      // Always refresh UI regardless of errors
      setSubmitting(false);
      invalidate({ resource: "Payroll Entry", invalidates: ["list"] });
      invalidate({ resource: "Salary Slip", invalidates: ["list"] });
      setDetailRefreshKey(k => k + 1);
    }
  }

  const isLoading = peQuery?.isLoading || slipsQuery?.isLoading || loadingDetails;
  const isWorking = generating || calculatingCommissions;
  const peHasNoSlips = currentPE && salarySlips.length === 0 && !isLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payroll</h1>
          <p className="text-muted-foreground">Salary processing and history</p>
        </div>
        <div className="flex gap-2">
          {(!currentPE || peHasNoSlips) && !isLoading && (
            <Button onClick={handleGenerate} disabled={isWorking}>
              {generating ? (calculatingCommissions ? "Calculating commissions..." : "Generating...") : `Generate for ${monthLabel(today)}`}
            </Button>
          )}
          {currentPE && hasDraftSlips && (
            <>
              <Button variant="outline" onClick={handleRecalculate} disabled={calculatingCommissions || submitting}>
                {calculatingCommissions ? "Recalculating..." : "Recalculate Commissions"}
              </Button>
              <Button onClick={handleSubmitAll} disabled={submitting || calculatingCommissions}>
                {submitting ? "Submitting..." : "Submit All"}
              </Button>
            </>
          )}
          {allSlipsSubmitted && (
            <Badge variant="success" className="px-3 py-1.5 text-sm">Payroll Submitted</Badge>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-4 font-medium hover:text-red-900">&times;</button>
        </div>
      )}

      <Tabs defaultValue="current">
        <TabsList>
          <TabsTrigger value="current">Current Month</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="current">
          {!isLoading && !currentPE ? (
            <Card>
              <CardContent className="py-8">
                <p className="text-muted-foreground text-center">
                  No payroll entry for {monthLabel(today)}. Click "Generate" to create one for {activeCount} active employees.
                </p>
              </CardContent>
            </Card>
          ) : (
            <DataTable
              columns={slipColumns}
              data={salarySlips}
              isLoading={isLoading}
              searchKey="employee_name"
              searchPlaceholder="Search by employee..."
            />
          )}
        </TabsContent>

        <TabsContent value="history">
          <DataTable
            columns={historyColumns}
            data={allEntries}
            isLoading={false}
            searchKey="start_date"
            searchPlaceholder="Search by period..."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
