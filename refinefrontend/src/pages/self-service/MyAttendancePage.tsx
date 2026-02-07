import { useState } from "react";
import { useList, useCreate, useInvalidate } from "@refinedev/core";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Home } from "lucide-react";
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
import { DataTable, DataTableColumnHeader } from "@/components/data-table";

interface AttendanceRequest {
  name: string;
  employee: string;
  employee_name: string;
  from_date: string;
  to_date: string;
  reason: string;
  explanation: string;
  docstatus: number;
  workflow_state?: string;
}

function statusVariant(docstatus: number, workflowState?: string) {
  if (workflowState === "Approved" || docstatus === 1) return "success" as const;
  if (workflowState === "Rejected") return "destructive" as const;
  return "secondary" as const;
}

function getStatusLabel(docstatus: number, workflowState?: string) {
  if (workflowState) return workflowState;
  if (docstatus === 1) return "Approved";
  if (docstatus === 2) return "Cancelled";
  return "Pending";
}

const initialForm = {
  from_date: "",
  to_date: "",
  explanation: "",
};

export default function MyAttendancePage() {
  const { employee, employeeId, isLoading: employeeLoading } = useMyEmployee();
  const { mutateAsync: createDoc } = useCreate();
  const invalidate = useInvalidate();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch user's attendance requests (WFH only)
  const { result: requestsResult, query: requestsQuery } =
    useList<AttendanceRequest>({
      resource: "Attendance Request",
      filters: employeeId
        ? [
            { field: "employee", operator: "eq", value: employeeId },
            { field: "reason", operator: "eq", value: "Work From Home" },
          ]
        : [],
      pagination: { mode: "off" },
      sorters: [{ field: "creation", order: "desc" }],
      meta: {
        fields: [
          "name",
          "employee",
          "employee_name",
          "from_date",
          "to_date",
          "reason",
          "explanation",
          "docstatus",
          "workflow_state",
        ],
      },
      queryOptions: { enabled: !!employeeId },
    });
  const requests = (requestsResult?.data ?? []) as AttendanceRequest[];

  // Table columns
  const columns: ColumnDef<AttendanceRequest, unknown>[] = [
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
      id: "days",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Days"
          className="text-right"
        />
      ),
      cell: ({ row }) => {
        const from = new Date(row.original.from_date);
        const to = new Date(row.original.to_date);
        const days =
          Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        return <div className="text-right">{days}</div>;
      },
    },
    {
      id: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => {
        const status = getStatusLabel(
          row.original.docstatus,
          row.original.workflow_state
        );
        return (
          <Badge
            variant={statusVariant(
              row.original.docstatus,
              row.original.workflow_state
            )}
          >
            {status}
          </Badge>
        );
      },
      filterFn: "arrIncludesSome",
    },
    {
      accessorKey: "explanation",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Notes" />
      ),
      cell: ({ row }) => (
        <span className="truncate max-w-[200px] block">
          {row.original.explanation || "-"}
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
    if (!employeeId || !form.from_date || !form.to_date) {
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
        resource: "Attendance Request",
        values: {
          employee: employeeId,
          from_date: form.from_date,
          to_date: form.to_date,
          reason: "Work From Home",
          explanation: form.explanation,
        },
      });

      setSuccess("WFH request submitted successfully");
      invalidate({ resource: "Attendance Request", invalidates: ["list"] });

      setTimeout(() => {
        setDialogOpen(false);
        resetForm();
      }, 1500);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to submit WFH request";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (employeeLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-[200px]" />
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
          <h1 className="text-2xl font-bold tracking-tight">My Attendance</h1>
          <p className="text-muted-foreground">
            Request to work from home
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Request WFH
        </Button>
      </div>

      {/* WFH Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="h-5 w-5" />
            My WFH Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 && !requestsQuery.isLoading ? (
            <p className="text-muted-foreground text-center py-8">
              No WFH requests yet. Click "Request WFH" to submit a new request.
            </p>
          ) : (
            <DataTable
              columns={columns}
              data={requests}
              isLoading={requestsQuery.isLoading}
            />
          )}
        </CardContent>
      </Card>

      {/* Request WFH Dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Work From Home</DialogTitle>
            <DialogDescription>
              Submit a request to work from home for approval
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
              <Label htmlFor="explanation">Notes</Label>
              <Textarea
                id="explanation"
                value={form.explanation}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, explanation: e.target.value }))
                }
                placeholder="Optional: Add any notes or explanation"
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
