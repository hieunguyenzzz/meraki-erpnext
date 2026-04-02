import { useState, useMemo, useEffect } from "react";
import { useList } from "@refinedev/core";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Calendar } from "lucide-react";
import { useMyEmployee } from "@/hooks/useMyEmployee";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";
import { RequestLeaveSheet } from "@/components/RequestLeaveSheet";

interface LeaveApplication {
  name: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  total_leave_days: number;
  status: string;
  description: string;
  docstatus: number;
}

function statusVariant(status: string) {
  switch (status) {
    case "Approved":
      return "success" as const;
    case "Rejected":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}

export default function MyLeavesPage() {
  const { employee, employeeId, isLoading: employeeLoading } = useMyEmployee();

  const [dialogOpen, setDialogOpen] = useState(false);

  // Fetch user's leave applications
  const { result: appsResult, query: appsQuery } = useList<LeaveApplication>({
    resource: "Leave Application",
    filters: employeeId
      ? [{ field: "employee", operator: "eq", value: employeeId }]
      : [],
    pagination: { mode: "off" },
    sorters: [{ field: "creation", order: "desc" }],
    meta: {
      fields: [
        "name",
        "leave_type",
        "from_date",
        "to_date",
        "total_leave_days",
        "status",
        "description",
        "docstatus",
      ],
    },
    queryOptions: { enabled: !!employeeId },
  });
  const leaveApps = (appsResult?.data ?? []) as LeaveApplication[];

  // Fetch leave balances from backend (computed as admin, avoids field permission issues)
  const [balanceData, setBalanceData] = useState<{ data: any[]; before_august: boolean } | null>(null);
  useEffect(() => {
    if (!employeeId) return;
    fetch(`/inquiry-api/leave/balance?employee=${employeeId}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setBalanceData)
      .catch(() => setBalanceData(null));
  }, [employeeId]);

  const leaveBalances = useMemo(() => {
    if (!balanceData?.data) return [];
    const beforeAugust = balanceData.before_august;

    return balanceData.data.map((item: any) => {
      const oldAllocDays = item.old_allocation ?? 0;
      const newAllocDays = item.new_allocation ?? 0;
      const rawOldTaken = item.old_taken ?? 0;
      const oldPending = item.old_pending ?? 0;
      const newTaken = item.new_taken ?? 0;
      const newPending = item.new_pending ?? 0;

      // Accrued amounts from backend (fall back to full allocation if missing)
      const oldAccrued = item.old_accrued ?? oldAllocDays;
      const newAccrued = item.new_accrued ?? newAllocDays;

      // Apply overflow: cap old taken at old allocation
      const cappedOldTaken = Math.min(rawOldTaken, oldAllocDays);
      const overflow = rawOldTaken - cappedOldTaken;

      // Cap usable at accrued amount
      const oldBalance = Math.min(oldAccrued, oldAllocDays) - cappedOldTaken - oldPending;
      const effectiveNewTaken = newTaken + overflow;
      const newBalance = Math.min(newAccrued, newAllocDays) - effectiveNewTaken - newPending;

      return {
        leaveType: item.leave_type,
        showOldPeriod: beforeAugust && oldAllocDays > 0,
        oldAllocDays,
        oldAccrued,
        oldTaken: cappedOldTaken,
        oldPending,
        oldBalance: Math.max(0, oldBalance),
        newAllocDays,
        newAccrued,
        newTaken: effectiveNewTaken,
        newPending,
        newBalance: Math.max(0, newBalance),
        totalBalance: Math.max(0, oldBalance) + Math.max(0, newBalance),
      };
    });
  }, [balanceData]);

  // Table columns
  const columns: ColumnDef<LeaveApplication, unknown>[] = [
    {
      accessorKey: "leave_type",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Leave Type" />
      ),
    },
    {
      accessorKey: "from_date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="From" />
      ),
      cell: ({ row }) => formatDate(row.original.from_date),
    },
    {
      accessorKey: "to_date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="To" />
      ),
      cell: ({ row }) => formatDate(row.original.to_date),
    },
    {
      accessorKey: "total_leave_days",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Days"
          className="text-right"
        />
      ),
      cell: ({ row }) => (
        <div className="text-right">{row.original.total_leave_days}</div>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => (
        <Badge variant={statusVariant(row.original.status)}>
          {row.original.status}
        </Badge>
      ),
      filterFn: "arrIncludesSome",
    },
    {
      accessorKey: "description",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Reason" />
      ),
      cell: ({ row }) => (
        <span className="truncate max-w-[200px] block">
          {row.original.description || "-"}
        </span>
      ),
    },
  ];

  if (employeeLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-[200px]" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <p className="text-destructive">
          No employee record found. Please contact your administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Leaves</h1>
          <p className="text-muted-foreground">
            View your leave balance and submit requests
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Request Leave
        </Button>
      </div>

      {/* Leave Balance Cards */}
      {leaveBalances.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {leaveBalances.map((balance) => (
            <Card key={balance.leaveType}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {balance.leaveType}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{balance.totalBalance}</span>
                  <span className="text-sm text-muted-foreground">days available</span>
                </div>
                {balance.showOldPeriod && (
                  <div className="text-xs text-muted-foreground border-t pt-2 space-y-0.5">
                    <div className="flex justify-between">
                      <span>{new Date().getFullYear() - 1} carry-over</span>
                      <span>{balance.oldBalance} / {balance.oldAllocDays} days</span>
                    </div>
                    {balance.oldTaken > 0 && (
                      <div className="flex justify-between text-[11px]">
                        <span className="pl-2">taken</span>
                        <span>{balance.oldTaken}</span>
                      </div>
                    )}
                    {balance.oldPending > 0 && (
                      <div className="flex justify-between text-[11px] text-yellow-600">
                        <span className="pl-2">pending</span>
                        <span>{balance.oldPending}</span>
                      </div>
                    )}
                  </div>
                )}
                <div className="text-xs text-muted-foreground border-t pt-2 space-y-0.5">
                  <div className="flex justify-between">
                    <span>{new Date().getFullYear()} allocation</span>
                    <span>{balance.newBalance} / {balance.newAccrued} days</span>
                  </div>
                  <div className="flex justify-between text-[11px] opacity-60">
                    <span className="pl-2">of {balance.newAllocDays} annual</span>
                  </div>
                  {balance.newTaken > 0 && (
                    <div className="flex justify-between text-[11px]">
                      <span className="pl-2">taken</span>
                      <span>{balance.newTaken}</span>
                    </div>
                  )}
                  {balance.newPending > 0 && (
                    <div className="flex justify-between text-[11px] text-yellow-600">
                      <span className="pl-2">pending</span>
                      <span>{balance.newPending}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {leaveBalances.length === 0 && (
        <Card>
          <CardContent className="py-6">
            <p className="text-muted-foreground text-center">
              No leave allocations found. Contact HR if you believe this is an
              error.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Leave Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            My Leave Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={leaveApps}
            isLoading={appsQuery.isLoading}
            filterableColumns={[
              {
                id: "status",
                title: "Status",
                options: [
                  { label: "Open", value: "Open" },
                  { label: "Approved", value: "Approved" },
                  { label: "Rejected", value: "Rejected" },
                ],
              },
            ]}
          />
        </CardContent>
      </Card>

      <RequestLeaveSheet open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
