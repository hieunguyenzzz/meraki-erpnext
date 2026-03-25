import { useState, useEffect, useMemo } from "react";
import { useList, useInvalidate, useApiUrl } from "@refinedev/core";
import type { ColumnDef } from "@tanstack/react-table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

/** Parse "YYYY-MM-DD" into a Date (local timezone) */
function parseDate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

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

// Vietnam PIT constants (2026 — new deductions, old 7 brackets until July 2026)
const PIT_PERSONAL_DEDUCTION = 15_500_000;
const PIT_DEPENDENT_DEDUCTION = 6_200_000;

const PIT_BRACKETS: { limit: number; rate: number; qd: number }[] = [
  { limit: 5_000_000, rate: 0.05, qd: 0 },
  { limit: 10_000_000, rate: 0.10, qd: 250_000 },
  { limit: 18_000_000, rate: 0.15, qd: 750_000 },
  { limit: 32_000_000, rate: 0.20, qd: 1_650_000 },
  { limit: 52_000_000, rate: 0.25, qd: 3_250_000 },
  { limit: 80_000_000, rate: 0.30, qd: 5_850_000 },
  { limit: Infinity, rate: 0.35, qd: 9_850_000 },
];

function calcTaxReduction(dependents: number): number {
  return PIT_PERSONAL_DEDUCTION + dependents * PIT_DEPENDENT_DEDUCTION;
}

function calcEstPIT(grossPay: number, siDeductions: number, dependents: number): number {
  const taxReduction = calcTaxReduction(dependents);
  const taxable = grossPay - siDeductions - taxReduction;
  if (taxable <= 0) return 0;
  const bracket = PIT_BRACKETS.find(b => taxable <= b.limit) ?? PIT_BRACKETS[PIT_BRACKETS.length - 1];
  return Math.round(taxable * bracket.rate - bracket.qd);
}

function getTotalSI(deductions: SalarySlipEarning[] | undefined): number {
  return getDeductionAmount(deductions, "BHXH (Employee)")
    + getDeductionAmount(deductions, "BHYT (Employee)")
    + getDeductionAmount(deductions, "BHTN (Employee)");
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

function buildSlipColumns(weddingAllowanceMap: Record<string, number>, dependentsMap: Record<string, number>, empNameMap: Record<string, string>): ColumnDef<SalarySlip, unknown>[] {
  return [
    {
      accessorKey: "employee_name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Employee" />,
      cell: ({ row }) => <span className="font-medium">{empNameMap[row.original.employee] || row.original.employee_name}</span>,
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
      id: "si_employee",
      header: ({ column }) => <DataTableColumnHeader column={column} title="SI 10.5%" className="text-right" />,
      cell: ({ row }) => <div className="text-right text-muted-foreground">{formatVND(getTotalSI(row.original.deductions))}</div>,
    },
    {
      id: "employer_bhxh",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Employer BHXH" className="text-right" />,
      cell: ({ row }) => <div className="text-right text-amber-600 dark:text-amber-400">{formatVND(getEmployerBHXH(row.original.deductions))}</div>,
    },
    {
      id: "tax_reduction",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tax Reduction" className="text-right" />,
      cell: ({ row }) => {
        const deps = dependentsMap[row.original.employee] ?? 0;
        return <div className="text-right text-muted-foreground">{formatVND(calcTaxReduction(deps))}</div>;
      },
    },
    {
      id: "est_pit",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Est. PIT" className="text-right" />,
      cell: ({ row }) => {
        const deps = dependentsMap[row.original.employee] ?? 0;
        const si = getTotalSI(row.original.deductions);
        const pit = calcEstPIT(row.original.gross_pay, si, deps);
        return <div className="text-right text-red-600 dark:text-red-400">{pit > 0 ? formatVND(pit) : <span className="text-muted-foreground">-</span>}</div>;
      },
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

export default function PayrollPage() {
  const today = now();
  const currentMonthStart = firstOfMonth(today);
  const currentMonthEnd = endOfMonth(today);

  const [selectedMonth, setSelectedMonth] = useState(currentMonthStart);
  const [isRunning, setIsRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailedSlips, setDetailedSlips] = useState<SalarySlip[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);

  const apiUrl = useApiUrl();
  const invalidate = useInvalidate();

  const isCurrentMonth = selectedMonth === currentMonthStart;

  // Fetch ALL payroll entries (for month selector + finding selected PE)
  const { result: allEntriesResult } = useList({
    resource: "Payroll Entry",
    pagination: { mode: "off" },
    sorters: [{ field: "start_date", order: "desc" }],
    meta: { fields: ["name", "posting_date", "start_date", "end_date", "docstatus", "status", "number_of_employees"] },
  });

  const allEntries = (allEntriesResult?.data ?? []) as PayrollEntry[];

  // Build month options from allEntries, deduplicated by start_date, sorted newest first
  const monthOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string }[] = [];

    // Always include current month
    seen.add(currentMonthStart);
    opts.push({ value: currentMonthStart, label: monthLabel(today) });

    for (const entry of allEntries) {
      if (!seen.has(entry.start_date)) {
        seen.add(entry.start_date);
        const d = parseDate(entry.start_date);
        opts.push({ value: entry.start_date, label: monthLabel(d) });
      }
    }

    // Sort newest first
    opts.sort((a, b) => b.value.localeCompare(a.value));
    return opts;
  }, [allEntries, currentMonthStart]);

  // Find the Payroll Entry for the selected month
  const selectedPE = useMemo(() => {
    return allEntries.find(e => e.start_date === selectedMonth) ?? null;
  }, [allEntries, selectedMonth]);

  // Compute end date for the selected month
  const selectedEnd = useMemo(() => {
    if (selectedPE) return selectedPE.end_date;
    const d = parseDate(selectedMonth);
    return endOfMonth(d);
  }, [selectedPE, selectedMonth]);

  // Fetch salary slips for selected Payroll Entry
  const { result: slipsResult, query: slipsQuery } = useList({
    resource: "Salary Slip",
    pagination: { mode: "off" },
    filters: selectedPE
      ? [{ field: "payroll_entry", operator: "eq", value: selectedPE.name }]
      : [{ field: "name", operator: "eq", value: "__never__" }],
    sorters: [{ field: "employee_name", order: "asc" }],
    meta: { fields: ["name", "employee", "employee_name", "gross_pay", "total_deduction", "net_pay", "posting_date", "docstatus"] },
    queryOptions: { enabled: !!selectedPE },
  });

  const basicSlips = (slipsResult?.data ?? []) as SalarySlip[];

  // Fetch detailed salary slips with earnings/deductions child tables
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
  const allSlipsSubmitted = selectedPE && salarySlips.length > 0 && salarySlips.every((s) => s.docstatus === 1);

  const { result: empResult } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "eq", value: "Active" }],
    meta: { fields: ["name"] },
  });

  const activeCount = empResult?.data?.length ?? 0;

  const { result: empDepsResult } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "eq", value: "Active" }],
    meta: { fields: ["name", "first_name", "last_name", "employee_name", "custom_number_of_dependents"] },
  });

  const dependentsMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const emp of (empDepsResult?.data ?? []) as any[]) {
      map[emp.name] = emp.custom_number_of_dependents ?? 0;
    }
    return map;
  }, [empDepsResult?.data]);

  const empNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const emp of (empDepsResult?.data ?? []) as any[]) {
      const fromParts = [emp.last_name, emp.first_name].filter(Boolean).join(" ");
      const displayName = emp.employee_name?.startsWith("HR-EMP-") ? "" : emp.employee_name;
      map[emp.name] = fromParts || displayName || emp.name;
    }
    return map;
  }, [empDepsResult?.data]);

  // Fetch Wedding Allowance Additional Salary records for selected period
  const { result: additionalSalariesResult } = useList({
    resource: "Additional Salary",
    pagination: { mode: "off" },
    filters: [
      { field: "salary_component", operator: "eq", value: "Wedding Allowance" },
      { field: "payroll_date", operator: "gte", value: selectedMonth },
      { field: "payroll_date", operator: "lte", value: selectedEnd },
      { field: "docstatus", operator: "eq", value: 1 },
    ],
    meta: { fields: ["name", "employee", "amount", "custom_wedding_project"] },
    queryOptions: { enabled: !!selectedMonth && !!selectedEnd },
  });

  const weddingAllowanceMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const rec of (additionalSalariesResult?.data ?? []) as any[]) {
      map[rec.employee] = (map[rec.employee] ?? 0) + (rec.amount ?? 0);
    }
    return map;
  }, [additionalSalariesResult?.data]);

  const slipColumns = useMemo(() => buildSlipColumns(weddingAllowanceMap, dependentsMap, empNameMap), [weddingAllowanceMap, dependentsMap, empNameMap]);

  async function handleGenerate() {
    setIsRunning(true);
    setError(null);
    try {
      const res = await fetch("/inquiry-api/generate-payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: currentMonthStart, end_date: currentMonthEnd }),
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
    if (!selectedPE) return;
    setSubmitting(true);
    setError(null);
    try {
      const resp = await fetch("/inquiry-api/payroll/submit-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payroll_entry: selectedPE.name }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to submit payroll");
      }

      const result = await resp.json();
      if (result.failed && result.failed.length > 0) {
        setError(result.failed.join(" | "));
      }
    } catch (err: any) {
      setError(extractErrorMessage(err, "Failed to submit payroll"));
    } finally {
      setSubmitting(false);
      invalidate({ resource: "Payroll Entry", invalidates: ["list"] });
      invalidate({ resource: "Salary Slip", invalidates: ["list"] });
      setDetailRefreshKey(k => k + 1);
    }
  }

  const isLoading = slipsQuery?.isLoading || loadingDetails;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payroll</h1>
          <p className="text-muted-foreground">Salary processing and history</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isCurrentMonth && !isLoading && !allSlipsSubmitted && (
            <Button onClick={handleGenerate} disabled={isRunning || submitting}>
              {isRunning ? "Generating..." : selectedPE ? `Recalculate` : `Generate`}
            </Button>
          )}
          {isCurrentMonth && selectedPE && hasDraftSlips && (
            <Button onClick={handleSubmitAll} disabled={submitting || isRunning}>
              {submitting ? "Submitting..." : "Submit All"}
            </Button>
          )}
          {isCurrentMonth && allSlipsSubmitted && (
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

      {!isLoading && !selectedPE ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-muted-foreground text-center">
              {isCurrentMonth
                ? `No payroll entry for ${monthLabel(today)}. Click "Generate" to create one for ${activeCount} active employees.`
                : `No payroll entry for ${monthOptions.find(o => o.value === selectedMonth)?.label ?? selectedMonth}.`}
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
    </div>
  );
}
