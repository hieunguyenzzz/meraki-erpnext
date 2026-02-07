import { useState, useMemo } from "react";
import { Link } from "react-router";
import { useList, useUpdate, useInvalidate } from "@refinedev/core";
import type { ColumnDef } from "@tanstack/react-table";
import { Users, AlertCircle, Clock, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";
import { formatDate } from "@/lib/format";
import {
  getReviewStatus,
  getReviewBadgeVariant,
  getReviewStatusText,
  getLeaveBalanceVariant,
  type ReviewStatus,
} from "@/lib/review-status";

interface StaffRow {
  name: string;
  employee_name: string;
  designation: string;
  department: string;
  date_of_joining: string;
  custom_last_review_date?: string;
  custom_review_notes?: string;
  review_status: ReviewStatus;
  leave_allocated: number;
  leave_taken: number;
  leave_remaining: number;
}

type SummaryFilter = "all" | "overdue" | "due-soon" | "up-to-date";

export default function StaffOverviewPage() {
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>("all");
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<StaffRow | null>(null);
  const [reviewDate, setReviewDate] = useState(new Date().toISOString().split("T")[0]);
  const [reviewNotes, setReviewNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidate = useInvalidate();
  const { mutateAsync: updateEmployee } = useUpdate();

  // Fetch employees
  const { result: employeesResult, query: employeesQuery } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "eq", value: "Active" }],
    sorters: [{ field: "employee_name", order: "asc" }],
    meta: {
      fields: [
        "name",
        "employee_name",
        "designation",
        "department",
        "date_of_joining",
        "custom_last_review_date",
        "custom_review_notes",
      ],
    },
  });

  // Fetch leave allocations (submitted)
  const { result: allocsResult } = useList({
    resource: "Leave Allocation",
    pagination: { mode: "off" },
    filters: [{ field: "docstatus", operator: "eq", value: 1 }],
    meta: {
      fields: ["name", "employee", "leave_type", "total_leaves_allocated", "new_leaves_allocated"],
    },
  });

  // Fetch approved leave applications
  const { result: appsResult } = useList({
    resource: "Leave Application",
    pagination: { mode: "off" },
    filters: [
      { field: "status", operator: "eq", value: "Approved" },
      { field: "docstatus", operator: "eq", value: 1 },
    ],
    meta: { fields: ["name", "employee", "leave_type", "total_leave_days"] },
  });

  const employees = (employeesResult?.data ?? []) as any[];
  const allocations = (allocsResult?.data ?? []) as any[];
  const applications = (appsResult?.data ?? []) as any[];

  // Build leave data maps
  const { allocByEmployee, takenByEmployee } = useMemo(() => {
    // Sum allocations per employee (across all leave types)
    const allocMap = new Map<string, number>();
    for (const alloc of allocations) {
      const current = allocMap.get(alloc.employee) ?? 0;
      allocMap.set(alloc.employee, current + (alloc.total_leaves_allocated ?? alloc.new_leaves_allocated ?? 0));
    }

    // Sum taken leave per employee
    const takenMap = new Map<string, number>();
    for (const app of applications) {
      const current = takenMap.get(app.employee) ?? 0;
      takenMap.set(app.employee, current + (app.total_leave_days ?? 0));
    }

    return { allocByEmployee: allocMap, takenByEmployee: takenMap };
  }, [allocations, applications]);

  // Combine into staff rows
  const staffData: StaffRow[] = useMemo(() => {
    return employees.map((emp) => {
      const allocated = allocByEmployee.get(emp.name) ?? 0;
      const taken = takenByEmployee.get(emp.name) ?? 0;
      return {
        name: emp.name,
        employee_name: emp.employee_name,
        designation: emp.designation || "-",
        department: emp.department || "-",
        date_of_joining: emp.date_of_joining,
        custom_last_review_date: emp.custom_last_review_date,
        custom_review_notes: emp.custom_review_notes,
        review_status: getReviewStatus(emp.custom_last_review_date),
        leave_allocated: allocated,
        leave_taken: taken,
        leave_remaining: allocated - taken,
      };
    });
  }, [employees, allocByEmployee, takenByEmployee]);

  // Summary counts
  const { total, overdue, dueSoon, upToDate } = useMemo(() => {
    let overdue = 0;
    let dueSoon = 0;
    let upToDate = 0;

    for (const row of staffData) {
      switch (row.review_status) {
        case "overdue":
        case "never-reviewed":
          overdue++;
          break;
        case "due-soon":
          dueSoon++;
          break;
        case "up-to-date":
          upToDate++;
          break;
      }
    }

    return { total: staffData.length, overdue, dueSoon, upToDate };
  }, [staffData]);

  // Filter data by summary card selection
  const filteredData = useMemo(() => {
    if (summaryFilter === "all") return staffData;
    return staffData.filter((row) => {
      switch (summaryFilter) {
        case "overdue":
          return row.review_status === "overdue" || row.review_status === "never-reviewed";
        case "due-soon":
          return row.review_status === "due-soon";
        case "up-to-date":
          return row.review_status === "up-to-date";
        default:
          return true;
      }
    });
  }, [staffData, summaryFilter]);

  // Handle adding review
  function openReviewDialog(employee: StaffRow) {
    setSelectedEmployee(employee);
    setReviewDate(employee.custom_last_review_date || new Date().toISOString().split("T")[0]);
    setReviewNotes(employee.custom_review_notes || "");
    setError(null);
    setReviewDialogOpen(true);
  }

  async function handleSaveReview() {
    if (!selectedEmployee || !reviewDate) return;
    setSaving(true);
    setError(null);
    try {
      await updateEmployee({
        resource: "Employee",
        id: selectedEmployee.name,
        values: {
          custom_last_review_date: reviewDate,
          custom_review_notes: reviewNotes,
        },
      });
      invalidate({ resource: "Employee", invalidates: ["list"] });
      setReviewDialogOpen(false);
      setSelectedEmployee(null);
    } catch (err: any) {
      setError(err?.message || "Failed to save review");
    } finally {
      setSaving(false);
    }
  }

  // Table columns
  const columns: ColumnDef<StaffRow, unknown>[] = [
    {
      accessorKey: "employee_name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => (
        <Link to={`/hr/employees/${row.original.name}`} className="font-medium text-primary hover:underline">
          {row.original.employee_name}
        </Link>
      ),
      filterFn: "includesString",
    },
    {
      accessorKey: "designation",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
    },
    {
      accessorKey: "department",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Dept" />,
      filterFn: "arrIncludesSome",
    },
    {
      accessorKey: "date_of_joining",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Joined" />,
      cell: ({ row }) => formatDate(row.original.date_of_joining),
    },
    {
      accessorKey: "review_status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Review Status" />,
      cell: ({ row }) => {
        const status = row.original.review_status;
        const variant = getReviewBadgeVariant(status);
        const text = getReviewStatusText(row.original.custom_last_review_date);
        return <Badge variant={variant}>{text}</Badge>;
      },
      filterFn: "arrIncludesSome",
    },
    {
      id: "leave_balance",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Leave Balance" />,
      cell: ({ row }) => {
        const { leave_remaining, leave_allocated } = row.original;
        if (leave_allocated === 0) {
          return <span className="text-muted-foreground">No allocation</span>;
        }
        const variant = getLeaveBalanceVariant(leave_remaining, leave_allocated);
        return (
          <Link to={`/hr/leaves`} className="hover:underline">
            <Badge variant={variant}>
              {leave_remaining}/{leave_allocated} days
            </Badge>
          </Link>
        );
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <Button size="sm" variant="outline" onClick={() => openReviewDialog(row.original)}>
          {row.original.custom_last_review_date ? "Edit Review" : "Add Review"}
        </Button>
      ),
      enableSorting: false,
    },
  ];

  const isLoading = employeesQuery.isLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Staff Overview</h1>
        <p className="text-muted-foreground">Employee status, reviews, and leave balances at a glance</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card
          className={`cursor-pointer transition-colors ${summaryFilter === "all" ? "ring-2 ring-primary" : "hover:bg-muted/50"}`}
          onClick={() => setSummaryFilter("all")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Staff</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-colors ${summaryFilter === "overdue" ? "ring-2 ring-destructive" : "hover:bg-muted/50"}`}
          onClick={() => setSummaryFilter("overdue")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Review Overdue</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{overdue}</div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-colors ${summaryFilter === "due-soon" ? "ring-2 ring-amber-500" : "hover:bg-muted/50"}`}
          onClick={() => setSummaryFilter("due-soon")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Due Soon</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{dueSoon}</div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-colors ${summaryFilter === "up-to-date" ? "ring-2 ring-green-500" : "hover:bg-muted/50"}`}
          onClick={() => setSummaryFilter("up-to-date")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Up to Date</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{upToDate}</div>
          </CardContent>
        </Card>
      </div>

      {/* Staff Table */}
      <DataTable
        columns={columns}
        data={filteredData}
        isLoading={isLoading}
        searchKey="employee_name"
        searchPlaceholder="Search by name..."
        filterableColumns={[
          {
            id: "department",
            title: "Department",
            options: [
              { label: "Operations", value: "Operations" },
              { label: "Management", value: "Management" },
              { label: "Administration", value: "Administration" },
            ],
          },
          {
            id: "review_status",
            title: "Review Status",
            options: [
              { label: "Overdue", value: "overdue" },
              { label: "Never Reviewed", value: "never-reviewed" },
              { label: "Due Soon", value: "due-soon" },
              { label: "Up to Date", value: "up-to-date" },
            ],
          },
        ]}
      />

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Review</DialogTitle>
            <DialogDescription>
              {selectedEmployee?.employee_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="review-date">Review Date</Label>
              <Input
                id="review-date"
                type="date"
                value={reviewDate}
                onChange={(e) => setReviewDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-notes">Notes</Label>
              <Textarea
                id="review-notes"
                placeholder="Add review notes..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="min-h-[120px]"
              />
            </div>
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSaveReview} disabled={saving || !reviewDate}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
