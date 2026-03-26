import { useMemo } from "react";
import { useList } from "@refinedev/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Parse YYYY-MM-DD → Date in local timezone */
function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Years of seniority since date_of_joining */
function seniority(dateOfJoining: string): number {
  const doj = parseDate(dateOfJoining);
  const now = new Date();
  let years = now.getFullYear() - doj.getFullYear();
  if (now.getMonth() < doj.getMonth() || (now.getMonth() === doj.getMonth() && now.getDate() < doj.getDate())) {
    years--;
  }
  return Math.max(0, years);
}

interface Employee {
  name: string;
  employee_name: string;
  first_name: string;
  last_name: string;
  date_of_joining: string;
  status: string;
}

interface LeaveAllocation {
  name: string;
  employee: string;
  from_date: string;
  to_date: string;
  new_leaves_allocated: number;
  total_leaves_allocated: number;
  leaves_taken: number;  // Not available via list, we compute from applications
}

interface LeaveApplication {
  name: string;
  employee: string;
  from_date: string;
  to_date: string;
  total_leave_days: number;
  status: string;
}

/** Count how many leave days fall in a specific month/year from a leave application */
function leaveDaysInMonth(app: LeaveApplication, year: number, month: number): number {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const appStart = parseDate(app.from_date);
  const appEnd = parseDate(app.to_date);

  const overlapStart = appStart > monthStart ? appStart : monthStart;
  const overlapEnd = appEnd < monthEnd ? appEnd : monthEnd;

  if (overlapStart > overlapEnd) return 0;

  // Count weekdays in overlap (simple: count all days, ERPNext already excludes weekends in total_leave_days)
  // For monthly breakdown, use proportional split
  const appTotalDays = Math.round((appEnd.getTime() - appStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const overlapDays = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  if (appTotalDays <= 0) return 0;
  return Math.round((overlapDays / appTotalDays) * app.total_leave_days * 10) / 10;
}

/** Compute accrued days to date: ceil(allocation × elapsed_months / 12), capped at allocation */
function computeAccrued(allocation: number, accrualStart: Date, today: Date): number {
  if (allocation <= 0) return 0;
  const y1 = accrualStart.getFullYear(), m1 = accrualStart.getMonth();
  const y2 = today.getFullYear(), m2 = today.getMonth();
  const elapsedMonths = (y2 - y1) * 12 + (m2 - m1);
  if (elapsedMonths <= 0) return 0;
  return Math.min(allocation, Math.ceil(allocation * elapsedMonths / 12));
}

interface EmployeeRow {
  employee: string;
  employeeName: string;
  dateOfJoining: string;
  seniorityYears: number;
  monthlyLeave: number[]; // 12 values for Jan-Dec of current display year
  oldAllocationDays: number;   // 2025 period allocation
  oldTaken: number;            // taken from 2025 period
  oldBalance: number;          // 2025 remaining
  newAllocationDays: number;   // 2026 period allocation
  newTaken: number;            // taken from 2026 period
  newBalance: number;          // 2026 remaining
  newAccrued: number;          // accrued so far for 2026 (from Jan 1)
  newUsable: number;           // newAccrued - newTaken (clamped to 0)
}

export default function LeaveReportPage() {
  // Current year for display
  const currentYear = new Date().getFullYear(); // 2026

  // Fetch active employees
  const { result: empResult, query: empQuery } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "eq", value: "Active" }],
    sorters: [{ field: "employee_name", order: "asc" }],
    meta: { fields: ["name", "employee_name", "first_name", "last_name", "date_of_joining", "status"] },
  });

  // Fetch all leave allocations (both periods)
  const { result: allocResult } = useList({
    resource: "Leave Allocation",
    pagination: { mode: "off" },
    filters: [
      { field: "leave_type", operator: "eq", value: "Casual Leave" },
      { field: "docstatus", operator: "eq", value: 1 },
    ],
    meta: { fields: ["name", "employee", "from_date", "to_date", "new_leaves_allocated", "total_leaves_allocated"] },
  });

  // Fetch approved leave applications for the display range
  const { result: appResult } = useList({
    resource: "Leave Application",
    pagination: { mode: "off" },
    filters: [
      { field: "leave_type", operator: "eq", value: "Casual Leave" },
      { field: "status", operator: "eq", value: "Approved" },
      { field: "from_date", operator: "gte", value: `${currentYear - 1}-01-01` },
      { field: "to_date", operator: "lte", value: `${currentYear + 1}-12-31` },
    ],
    meta: { fields: ["name", "employee", "from_date", "to_date", "total_leave_days", "status"] },
  });

  const employees = (empResult?.data ?? []) as Employee[];
  const allocations = (allocResult?.data ?? []) as LeaveAllocation[];
  const applications = (appResult?.data ?? []) as LeaveApplication[];

  // Build rows
  const rows: EmployeeRow[] = useMemo(() => {
    return employees.map((emp) => {
      const empAllocations = allocations.filter((a) => a.employee === emp.name);
      const empApps = applications.filter((a) => a.employee === emp.name);

      // Old period: Jan 1 2026 - Jul 31 2026
      const oldAlloc = empAllocations.find((a) => a.from_date === "2026-01-01");
      const oldAllocationDays = oldAlloc?.new_leaves_allocated ?? 0;

      // New period: Aug 1 2026 - Jul 31 2027
      const newAlloc = empAllocations.find((a) => a.from_date === "2026-08-01");
      const newAllocationDays = newAlloc?.new_leaves_allocated ?? 0;

      // Calculate taken for old period (apps with from_date before Aug 1 2026)
      const oldCutoff = new Date(2026, 7, 1); // Aug 1 2026
      const oldApps = empApps.filter((a) => parseDate(a.from_date) < oldCutoff);
      const oldTaken = oldApps.reduce((sum, a) => sum + a.total_leave_days, 0);

      // Calculate taken for new period (apps with from_date >= Aug 1 2026)
      const newApps = empApps.filter((a) => parseDate(a.from_date) >= oldCutoff);
      const newTaken = newApps.reduce((sum, a) => sum + a.total_leave_days, 0);

      // Monthly breakdown for current year
      const monthlyLeave = MONTHS.map((_, monthIdx) => {
        let total = 0;
        for (const app of empApps) {
          total += leaveDaysInMonth(app, currentYear, monthIdx);
        }
        return Math.round(total * 10) / 10;
      });

      // Cap old taken at allocation; overflow spills into new period
      const cappedOldTaken = Math.min(oldTaken, oldAllocationDays);
      const overflow = oldTaken - cappedOldTaken;
      const effectiveNewTaken = newTaken + overflow;

      // 2026 accrual: from Jan 1 of current year
      const today = new Date();
      const accrualStart = new Date(currentYear, 0, 1); // Jan 1
      const newAccrued = computeAccrued(newAllocationDays, accrualStart, today);
      const newUsable = Math.max(0, newAccrued - effectiveNewTaken);

      return {
        employee: emp.name,
        employeeName: [emp.first_name, emp.last_name].filter(Boolean).join(" ") || emp.employee_name || emp.name,
        dateOfJoining: emp.date_of_joining,
        seniorityYears: seniority(emp.date_of_joining),
        monthlyLeave,
        oldAllocationDays,
        oldTaken: cappedOldTaken,
        oldBalance: oldAllocationDays - cappedOldTaken,
        newAllocationDays,
        newTaken: effectiveNewTaken,
        newBalance: newAllocationDays - effectiveNewTaken,
        newAccrued,
        newUsable,
      };
    });
  }, [employees, allocations, applications, currentYear]);

  // Hide employees with no leave allocations (freelancers / no-salary staff)
  const filteredRows = rows.filter((r) => r.oldAllocationDays > 0 || r.newAllocationDays > 0);

  const isLoading = empQuery?.isLoading;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leave Report</h1>
        <p className="text-muted-foreground">
          Team leave calendar {currentYear} &middot; Leave year resets August 1
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {filteredRows.length} Employees
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Loading leave data...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="sticky left-0 z-10 bg-muted/50 min-w-[180px]">Employee</TableHead>
                    {MONTHS.map((m) => (
                      <TableHead key={m} className="text-center min-w-[50px]">{m}</TableHead>
                    ))}
                    <TableHead className="text-center min-w-[90px] bg-blue-50 dark:bg-blue-950/30">
                      <div className="text-xs leading-tight">2025<br />Allocation</div>
                    </TableHead>
                    <TableHead className="text-center min-w-[80px] bg-blue-50 dark:bg-blue-950/30">
                      <div className="text-xs leading-tight">2025<br />Taken</div>
                    </TableHead>
                    <TableHead className="text-center min-w-[80px] bg-blue-50 dark:bg-blue-950/30">
                      <div className="text-xs leading-tight">2025<br />Balance</div>
                    </TableHead>
                    <TableHead className="text-center min-w-[90px] bg-green-50 dark:bg-green-950/30">
                      <div className="text-xs leading-tight">2026<br />Allocation</div>
                    </TableHead>
                    <TableHead className="text-center min-w-[80px] bg-green-50 dark:bg-green-950/30">
                      <div className="text-xs leading-tight">2026<br />Taken</div>
                    </TableHead>
                    <TableHead className="text-center min-w-[80px] bg-green-50 dark:bg-green-950/30">
                      <div className="text-xs leading-tight">2026<br />Balance</div>
                    </TableHead>
                    <TableHead className="text-center min-w-[90px] bg-orange-50 dark:bg-orange-950/30">
                      <div className="text-xs leading-tight font-semibold">2026<br />Usable</div>
                    </TableHead>
                    <TableHead className="text-center min-w-[80px] bg-purple-50 dark:bg-purple-950/30">
                      <div className="text-xs leading-tight font-semibold">Total<br />Balance</div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.employee}>
                      <TableCell className="sticky left-0 z-10 bg-background font-medium">
                        {row.employeeName}
                      </TableCell>
                      {row.monthlyLeave.map((days, i) => (
                        <TableCell key={i} className="text-center text-sm">
                          {days > 0 ? (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-medium text-xs">
                              {days % 1 === 0 ? days : days.toFixed(1)}
                            </span>
                          ) : null}
                        </TableCell>
                      ))}
                      {/* 2025 period */}
                      <TableCell className="text-center text-sm bg-blue-50/50 dark:bg-blue-950/20">
                        {row.oldAllocationDays}
                      </TableCell>
                      <TableCell className="text-center text-sm bg-blue-50/50 dark:bg-blue-950/20">
                        {row.oldTaken > 0 ? row.oldTaken : "-"}
                      </TableCell>
                      <TableCell className="text-center text-sm bg-blue-50/50 dark:bg-blue-950/20">
                        <Badge variant={row.oldBalance < 0 ? "destructive" : row.oldBalance > 0 ? "success" : "secondary"} className="text-xs">
                          {row.oldBalance}
                        </Badge>
                      </TableCell>
                      {/* 2026 period */}
                      <TableCell className="text-center text-sm bg-green-50/50 dark:bg-green-950/20">
                        {row.newAllocationDays}
                      </TableCell>
                      <TableCell className="text-center text-sm bg-green-50/50 dark:bg-green-950/20">
                        {row.newTaken > 0 ? row.newTaken : "-"}
                      </TableCell>
                      <TableCell className="text-center text-sm bg-green-50/50 dark:bg-green-950/20">
                        <Badge variant={row.newBalance < 0 ? "destructive" : row.newBalance > 0 ? "success" : "secondary"} className="text-xs">
                          {row.newBalance}
                        </Badge>
                      </TableCell>
                      {/* 2026 Usable (accrued so far minus taken) */}
                      <TableCell className="text-center text-sm bg-orange-50/50 dark:bg-orange-950/20">
                        <Badge variant={row.newUsable > 0 ? "success" : "secondary"} className="text-xs font-semibold">
                          {row.newUsable}
                        </Badge>
                      </TableCell>
                      {/* Total balance */}
                      <TableCell className="text-center text-sm bg-purple-50/50 dark:bg-purple-950/20">
                        {(() => { const total = row.oldBalance + row.newBalance; return (
                          <Badge variant={total < 0 ? "destructive" : total > 0 ? "success" : "secondary"} className="text-xs font-semibold">
                            {total}
                          </Badge>
                        ); })()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={19 + MONTHS.length} className="text-center text-muted-foreground py-8">
                        No active employees found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
