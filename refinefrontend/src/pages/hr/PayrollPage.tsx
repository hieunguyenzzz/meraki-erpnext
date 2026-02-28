import { useState, useEffect, useMemo } from "react";
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

function buildSlipColumns(weddingAllowanceMap: Record<string, number>): ColumnDef<SalarySlip, unknown>[] {
  return [
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
      id: "wedding_allowance",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Wedding Allowance" className="text-right" />,
      cell: ({ row }) => {
        const amount = weddingAllowanceMap[row.original.employee] ?? 0;
        return <div className="text-right">{amount > 0 ? formatVND(amount) : <span className="text-muted-foreground">-</span>}</div>;
      },
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
}

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

  const [isRunning, setIsRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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

  // Fetch Wedding Allowance Additional Salary records for current period
  const { result: additionalSalariesResult } = useList({
    resource: "Additional Salary",
    pagination: { mode: "off" },
    filters: [
      { field: "salary_component", operator: "eq", value: "Wedding Allowance" },
      { field: "payroll_date", operator: "gte", value: start },
      { field: "payroll_date", operator: "lte", value: end },
      { field: "docstatus", operator: "eq", value: 1 },
    ],
    meta: { fields: ["name", "employee", "amount", "custom_wedding_project"] },
    queryOptions: { enabled: !!start && !!end },
  });

  const weddingAllowanceMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const rec of (additionalSalariesResult?.data ?? []) as any[]) {
      map[rec.employee] = (map[rec.employee] ?? 0) + (rec.amount ?? 0);
    }
    return map;
  }, [additionalSalariesResult?.data]);

  const slipColumns = useMemo(() => buildSlipColumns(weddingAllowanceMap), [weddingAllowanceMap]);

  async function handleGenerate() {
    setIsRunning(true);
    setError(null);
    try {
      const res = await fetch("/inquiry-api/generate-payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: start, end_date: end }),
      });
      if (!res.ok) throw new Error(`Payroll generation failed: ${res.status}`);
      invalidate({ resource: "Payroll Entry", invalidates: ["list"] });
      invalidate({ resource: "Salary Slip", invalidates: ["list"] });
      invalidate({ resource: "Additional Salary", invalidates: ["list"] });
      setDetailRefreshKey(k => k + 1);
    } catch (err: any) {
      setError(extractErrorMessage(err, "Failed to generate payroll"));
    } finally {
      setIsRunning(false);
    }
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
  const peHasNoSlips = currentPE && salarySlips.length === 0 && !isLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payroll</h1>
          <p className="text-muted-foreground">Salary processing and history</p>
        </div>
        <div className="flex gap-2">
          {!isLoading && !allSlipsSubmitted && (
            <Button onClick={handleGenerate} disabled={isRunning || submitting}>
              {isRunning ? "Generating..." : currentPE ? `Recalculate ${monthLabel(today)}` : `Generate for ${monthLabel(today)}`}
            </Button>
          )}
          {currentPE && hasDraftSlips && (
            <Button onClick={handleSubmitAll} disabled={submitting || isRunning}>
              {submitting ? "Submitting..." : "Submit All"}
            </Button>
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
