import { useState, useMemo } from "react";
import { useList, useCreate, useInvalidate } from "@refinedev/core";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Calendar } from "lucide-react";
import { useMyEmployee } from "@/hooks/useMyEmployee";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";

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

interface LeaveType {
  name: string;
}

interface LeaveAllocation {
  name: string;
  leave_type: string;
  total_leaves_allocated: number;
  new_leaves_allocated: number;
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

const initialForm = {
  leave_type: "",
  from_date: "",
  to_date: "",
  description: "",
};

export default function MyLeavesPage() {
  const { employee, employeeId, isLoading: employeeLoading } = useMyEmployee();
  const { mutateAsync: createDoc } = useCreate();
  const invalidate = useInvalidate();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch leave types
  const { result: leaveTypesResult } = useList<LeaveType>({
    resource: "Leave Type",
    pagination: { mode: "off" },
    meta: { fields: ["name"] },
  });
  const leaveTypes = (leaveTypesResult?.data ?? []) as LeaveType[];

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

  // Fetch leave allocations for this employee
  const { result: allocsResult } = useList<LeaveAllocation>({
    resource: "Leave Allocation",
    filters: employeeId
      ? [
          { field: "employee", operator: "eq", value: employeeId },
          { field: "docstatus", operator: "eq", value: 1 },
        ]
      : [],
    pagination: { mode: "off" },
    meta: {
      fields: [
        "name",
        "leave_type",
        "total_leaves_allocated",
        "new_leaves_allocated",
      ],
    },
    queryOptions: { enabled: !!employeeId },
  });
  const allocations = (allocsResult?.data ?? []) as LeaveAllocation[];

  // Calculate leave balances
  const leaveBalances = useMemo(() => {
    const approvedApps = leaveApps.filter(
      (app) => app.status === "Approved" && app.docstatus === 1
    );
    const takenByType = new Map<string, number>();
    for (const app of approvedApps) {
      const current = takenByType.get(app.leave_type) ?? 0;
      takenByType.set(app.leave_type, current + (app.total_leave_days ?? 0));
    }

    return allocations.map((alloc) => {
      const allocated =
        alloc.total_leaves_allocated ?? alloc.new_leaves_allocated ?? 0;
      const taken = takenByType.get(alloc.leave_type) ?? 0;
      return {
        leaveType: alloc.leave_type,
        allocated,
        taken,
        remaining: allocated - taken,
      };
    });
  }, [allocations, leaveApps]);

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

  function resetForm() {
    setForm(initialForm);
    setError(null);
    setSuccess(null);
  }

  function handleDialogOpenChange(open: boolean) {
    setDialogOpen(open);
    if (!open) {
      resetForm();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId || !form.leave_type || !form.from_date || !form.to_date) {
      setError("Please fill in all required fields");
      return;
    }

    if (new Date(form.from_date) > new Date(form.to_date)) {
      setError("From date cannot be after To date");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await createDoc({
        resource: "Leave Application",
        values: {
          employee: employeeId,
          leave_type: form.leave_type,
          from_date: form.from_date,
          to_date: form.to_date,
          description: form.description,
          status: "Open",
        },
      });

      setSuccess("Leave request submitted successfully");
      invalidate({ resource: "Leave Application", invalidates: ["list"] });

      setTimeout(() => {
        setDialogOpen(false);
        resetForm();
      }, 1500);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to submit leave request";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

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
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{balance.remaining}</span>
                  <span className="text-sm text-muted-foreground">
                    / {balance.allocated} days
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {balance.taken} days taken
                </p>
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

      {/* Request Leave Dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Leave</DialogTitle>
            <DialogDescription>
              Submit a new leave request for approval
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-md border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-400">
                {success}
              </div>
            )}

            <div>
              <Label htmlFor="leave_type">Leave Type *</Label>
              <Select
                value={form.leave_type}
                onValueChange={(v) => setForm((prev) => ({ ...prev, leave_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select leave type" />
                </SelectTrigger>
                <SelectContent>
                  {leaveTypes.map((lt) => (
                    <SelectItem key={lt.name} value={lt.name}>
                      {lt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="from_date">From Date *</Label>
                <Input
                  id="from_date"
                  type="date"
                  value={form.from_date}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, from_date: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="to_date">To Date *</Label>
                <Input
                  id="to_date"
                  type="date"
                  value={form.to_date}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, to_date: e.target.value }))
                  }
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Reason</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Optional: Describe the reason for your leave"
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Submitting..." : "Submit Request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
