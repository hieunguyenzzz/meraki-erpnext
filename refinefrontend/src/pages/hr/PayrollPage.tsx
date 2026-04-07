import { useState, useEffect, useMemo } from "react";
import { useList, useInvalidate } from "@refinedev/core";
import type { ColumnDef } from "@tanstack/react-table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";
import { formatVND } from "@/lib/format";
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
  employee_display_name?: string;
  dependents?: number;
  gross_pay: number;
  total_deduction: number;
  net_pay: number;
  posting_date: string;
  docstatus: number;
  earnings: SalarySlipEarning[];
  deductions: SalarySlipEarning[];
  // Pre-computed by backend
  si_employee?: number;
  employer_bhxh?: number;
  tax_reduction?: number;
  taxable_income?: number;
  is_probation?: boolean;
}

function getEarningAmount(earnings: SalarySlipEarning[] | undefined, component: string): number {
  return earnings?.find(e => e.salary_component === component)?.amount ?? 0;
}

function getTotalCommission(earnings: SalarySlipEarning[] | undefined): number {
  const commissionComponents = ["Assistant Commission", "Support Planner Commission", "Lead Planner Commission", "Full Package Commission", "Partial Package Commission"];
  return earnings?.filter(e => commissionComponents.includes(e.salary_component))
    .reduce((sum, e) => sum + e.amount, 0) ?? 0;
}

function getDeductionAmount(deductions: SalarySlipEarning[] | undefined, component: string): number {
  return deductions?.find(e => e.salary_component === component)?.amount ?? 0;
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
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.original.employee_display_name || row.original.employee_name}</span>
          {row.original.is_probation && <Badge variant="outline" className="border-amber-500 text-amber-600 text-xs">85%</Badge>}
        </div>
      ),
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
      cell: ({ row }) => <div className="text-right text-muted-foreground">{formatVND(row.original.si_employee ?? 0)}</div>,
    },
    {
      id: "employer_bhxh",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Employer BHXH" className="text-right" />,
      cell: ({ row }) => <div className="text-right text-amber-600 dark:text-amber-400">{formatVND(row.original.employer_bhxh ?? 0)}</div>,
    },
    {
      id: "dependents",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Dependents" className="text-right" />,
      cell: ({ row }) => {
        const deps = row.original.dependents ?? 0;
        return <div className="text-right">{deps > 0 ? deps : <span className="text-muted-foreground">0</span>}</div>;
      },
    },
    {
      id: "tax_reduction",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tax Reduction" className="text-right" />,
      cell: ({ row }) => <div className="text-right text-muted-foreground">{formatVND(row.original.tax_reduction ?? 0)}</div>,
    },
    {
      id: "taxable_income",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Taxable Income" className="text-right" />,
      cell: ({ row }) => {
        const taxable = row.original.taxable_income ?? 0;
        return <div className={`text-right ${taxable < 0 ? "text-muted-foreground" : ""}`}>{formatVND(taxable)}</div>;
      },
    },
    {
      id: "est_pit",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Income Tax" className="text-right" />,
      cell: ({ row }) => {
        const pit = getDeductionAmount(row.original.deductions, "Income Tax");
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

  const [selectedMonth, setSelectedMonth] = useState(currentMonthStart);
  const [isRunning, setIsRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrichedSlips, setEnrichedSlips] = useState<SalarySlip[]>([]);
  const [loadingSlips, setLoadingSlips] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const invalidate = useInvalidate();

  // Fetch ALL payroll entries (for month selector + finding selected PE)
  const { result: allEntriesResult } = useList({
    resource: "Payroll Entry",
    pagination: { mode: "off" },
    sorters: [{ field: "start_date", order: "desc" }],
    meta: { fields: ["name", "posting_date", "start_date", "end_date", "docstatus", "status", "number_of_employees"] },
  });

  const allEntries = (allEntriesResult?.data ?? []) as PayrollEntry[];

  const monthOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string }[] = [];

    for (let i = 0; i < 12; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const val = firstOfMonth(d);
      if (!seen.has(val)) {
        seen.add(val);
        opts.push({ value: val, label: monthLabel(d) });
      }
    }

    for (const entry of allEntries) {
      if (!seen.has(entry.start_date)) {
        seen.add(entry.start_date);
        const d = parseDate(entry.start_date);
        opts.push({ value: entry.start_date, label: monthLabel(d) });
      }
    }

    opts.sort((a, b) => b.value.localeCompare(a.value));
    return opts;
  }, [allEntries, currentMonthStart]);

  const selectedPE = useMemo(() => {
    return allEntries.find(e => e.start_date === selectedMonth) ?? null;
  }, [allEntries, selectedMonth]);

  const selectedEnd = useMemo(() => {
    if (selectedPE) return selectedPE.end_date;
    const d = parseDate(selectedMonth);
    return endOfMonth(d);
  }, [selectedPE, selectedMonth]);

  // Fetch enriched salary slips from backend (single call, no N+1)
  useEffect(() => {
    if (!selectedPE) {
      setEnrichedSlips([]);
      return;
    }
    let cancelled = false;
    setLoadingSlips(true);
    fetch(`/inquiry-api/payroll/slips?pe_name=${encodeURIComponent(selectedPE.name)}`)
      .then(res => res.json())
      .then(json => { if (!cancelled) setEnrichedSlips(json.data ?? []); })
      .catch(() => { if (!cancelled) setEnrichedSlips([]); })
      .finally(() => { if (!cancelled) setLoadingSlips(false); });
    return () => { cancelled = true; };
  }, [selectedPE?.name, refreshKey]);

  // Hide draft slips with zero pay (freelancers with no weddings this month)
  const salarySlips = enrichedSlips.filter((s) => s.docstatus === 1 || s.gross_pay > 0);
  const hasDraftSlips = enrichedSlips.some((s) => s.docstatus === 0);
  const allSlipsSubmitted = selectedPE && salarySlips.length > 0 && salarySlips.every((s) => s.docstatus === 1);

  const { result: empResult } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "eq", value: "Active" }],
    meta: { fields: ["name"] },
  });

  const activeCount = empResult?.data?.length ?? 0;

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

  const slipColumns = useMemo(() => buildSlipColumns(weddingAllowanceMap), [weddingAllowanceMap]);

  async function handleGenerate() {
    setIsRunning(true);
    setError(null);
    try {
      const res = await fetch("/inquiry-api/generate-payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: selectedMonth, end_date: selectedEnd }),
      });
      if (!res.ok) throw new Error(`Payroll generation failed: ${res.status}`);
      invalidate({ resource: "Payroll Entry", invalidates: ["list"] });
      invalidate({ resource: "Additional Salary", invalidates: ["list"] });
      setRefreshKey(k => k + 1);
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
      setRefreshKey(k => k + 1);
    }
  }

  const isLoading = loadingSlips;

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
          {!isLoading && !allSlipsSubmitted && (
            <Button onClick={handleGenerate} disabled={isRunning || submitting}>
              {isRunning ? "Generating..." : selectedPE ? `Recalculate` : `Generate`}
            </Button>
          )}
          {selectedPE && hasDraftSlips && (
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

      {!isLoading && !selectedPE ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-muted-foreground text-center">
              {`No payroll entry for ${monthOptions.find(o => o.value === selectedMonth)?.label ?? selectedMonth}. Click "Generate" to create one for ${activeCount} active employees.`}
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

      {!isLoading && salarySlips.length > 0 && (() => {
        const commissionRows = salarySlips
          .map(s => {
            const lead = getEarningAmount(s.earnings, "Lead Planner Commission");
            const support = getEarningAmount(s.earnings, "Support Planner Commission");
            const assistant = getEarningAmount(s.earnings, "Assistant Commission");
            const fullPkg = getEarningAmount(s.earnings, "Full Package Commission");
            const partialPkg = getEarningAmount(s.earnings, "Partial Package Commission");
            const total = lead + support + assistant + fullPkg + partialPkg;
            if (total === 0) return null;
            return { name: s.employee_display_name || s.employee_name, lead, support, assistant, fullPkg, partialPkg, total };
          })
          .filter(Boolean) as { name: string; lead: number; support: number; assistant: number; fullPkg: number; partialPkg: number; total: number }[];
        if (commissionRows.length === 0) return null;
        const hasFullPkg = commissionRows.some(r => r.fullPkg > 0);
        const hasPartialPkg = commissionRows.some(r => r.partialPkg > 0);
        return (
          <div className="text-xs text-muted-foreground mt-2">
            <p className="font-medium mb-1">Commission Breakdown</p>
            <table className="w-auto">
              <thead>
                <tr className="text-left">
                  <th className="pr-4 font-normal">Employee</th>
                  <th className="pr-4 font-normal text-right">Lead</th>
                  <th className="pr-4 font-normal text-right">Support</th>
                  <th className="pr-4 font-normal text-right">Assistant</th>
                  {hasFullPkg && <th className="pr-4 font-normal text-right">Full Pkg</th>}
                  {hasPartialPkg && <th className="pr-4 font-normal text-right">Partial Pkg</th>}
                  <th className="font-normal text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {commissionRows.map(r => (
                  <tr key={r.name}>
                    <td className="pr-4">{r.name}</td>
                    <td className="pr-4 text-right">{r.lead > 0 ? formatVND(r.lead) : "-"}</td>
                    <td className="pr-4 text-right">{r.support > 0 ? formatVND(r.support) : "-"}</td>
                    <td className="pr-4 text-right">{r.assistant > 0 ? formatVND(r.assistant) : "-"}</td>
                    {hasFullPkg && <td className="pr-4 text-right">{r.fullPkg > 0 ? formatVND(r.fullPkg) : "-"}</td>}
                    {hasPartialPkg && <td className="pr-4 text-right">{r.partialPkg > 0 ? formatVND(r.partialPkg) : "-"}</td>}
                    <td className="text-right">{formatVND(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}
    </div>
  );
}
