import { useEffect, useState } from "react";
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

interface LeaveReportRow {
  employee: string;
  employee_name: string;
  date_of_joining: string;
  seniority_years: number;
  monthly_leave: number[];
  old_allocation_days: number;
  old_taken: number;
  old_balance: number;
  new_allocation_days: number;
  new_taken: number;
  new_balance: number;
  new_accrued: number;
  new_usable: number;
  total_balance: number;
}

interface LeaveReportData {
  data: LeaveReportRow[];
  current_year: number;
  months: string[];
  employee_count: number;
}

export default function LeaveReportPage() {
  const [report, setReport] = useState<LeaveReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/inquiry-api/reports/leave-report", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setReport(data))
      .catch(() => setReport(null))
      .finally(() => setIsLoading(false));
  }, []);

  const rows = report?.data ?? [];
  const currentYear = report?.current_year ?? new Date().getFullYear();

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
            {rows.length} Employees
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
                      <div className="text-xs leading-tight">{currentYear - 1}<br />Left over</div>
                    </TableHead>
                    <TableHead className="text-center min-w-[80px] bg-blue-50 dark:bg-blue-950/30">
                      <div className="text-xs leading-tight">{currentYear - 1}<br />Taken</div>
                    </TableHead>
                    <TableHead className="text-center min-w-[80px] bg-blue-50 dark:bg-blue-950/30">
                      <div className="text-xs leading-tight">{currentYear - 1}<br />Balance</div>
                    </TableHead>
                    <TableHead className="text-center min-w-[90px] bg-green-50 dark:bg-green-950/30">
                      <div className="text-xs leading-tight">{currentYear}<br />Allocation</div>
                    </TableHead>
                    <TableHead className="text-center min-w-[80px] bg-green-50 dark:bg-green-950/30">
                      <div className="text-xs leading-tight">{currentYear}<br />Taken</div>
                    </TableHead>
                    <TableHead className="text-center min-w-[80px] bg-green-50 dark:bg-green-950/30">
                      <div className="text-xs leading-tight">{currentYear}<br />Balance</div>
                    </TableHead>
                    <TableHead className="text-center min-w-[90px] bg-orange-50 dark:bg-orange-950/30">
                      <div className="text-xs leading-tight font-semibold">{currentYear}<br />Usable</div>
                    </TableHead>
                    <TableHead className="text-center min-w-[80px] bg-purple-50 dark:bg-purple-950/30">
                      <div className="text-xs leading-tight font-semibold">Total<br />Balance</div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.employee}>
                      <TableCell className="sticky left-0 z-10 bg-background font-medium">
                        {row.employee_name}
                      </TableCell>
                      {row.monthly_leave.map((days, i) => (
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
                        {row.old_allocation_days}
                      </TableCell>
                      <TableCell className="text-center text-sm bg-blue-50/50 dark:bg-blue-950/20">
                        {row.old_taken > 0 ? row.old_taken : "-"}
                      </TableCell>
                      <TableCell className="text-center text-sm bg-blue-50/50 dark:bg-blue-950/20">
                        <Badge variant={row.old_balance < 0 ? "destructive" : row.old_balance > 0 ? "success" : "secondary"} className="text-xs">
                          {row.old_balance}
                        </Badge>
                      </TableCell>
                      {/* 2026 period */}
                      <TableCell className="text-center text-sm bg-green-50/50 dark:bg-green-950/20">
                        {row.new_allocation_days}
                      </TableCell>
                      <TableCell className="text-center text-sm bg-green-50/50 dark:bg-green-950/20">
                        {row.new_taken > 0 ? row.new_taken : "-"}
                      </TableCell>
                      <TableCell className="text-center text-sm bg-green-50/50 dark:bg-green-950/20">
                        <Badge variant={row.new_balance < 0 ? "destructive" : row.new_balance > 0 ? "success" : "secondary"} className="text-xs">
                          {row.new_balance}
                        </Badge>
                      </TableCell>
                      {/* 2026 Usable */}
                      <TableCell className="text-center text-sm bg-orange-50/50 dark:bg-orange-950/20">
                        <Badge variant={row.new_usable > 0 ? "success" : "secondary"} className="text-xs font-semibold">
                          {row.new_usable}
                        </Badge>
                      </TableCell>
                      {/* Total balance */}
                      <TableCell className="text-center text-sm bg-purple-50/50 dark:bg-purple-950/20">
                        <Badge variant={row.total_balance < 0 ? "destructive" : row.total_balance > 0 ? "success" : "secondary"} className="text-xs font-semibold">
                          {row.total_balance}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
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
