import { useState, useMemo } from "react";
import { useParams } from "react-router";
import { useOne, useList, useUpdate, useInvalidate } from "@refinedev/core";
import { Pencil } from "lucide-react";
import { formatDate, formatVND } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { DetailSkeleton } from "@/components/detail-skeleton";
import {
  getReviewStatus,
  getReviewBadgeVariant,
  getReviewStatusText,
  getLeaveBalanceVariant,
} from "@/lib/review-status";
import { parseStaffRoles, getRoleBadgeVariant } from "@/lib/staff-roles";
import type { Employee } from "@/lib/types";

function calculateTenure(dateOfJoining: string): string {
  const joined = new Date(dateOfJoining);
  const now = new Date();
  const years = now.getFullYear() - joined.getFullYear();
  const months = now.getMonth() - joined.getMonth();

  let totalMonths = years * 12 + months;
  if (now.getDate() < joined.getDate()) totalMonths--;

  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;

  if (y === 0) return m === 1 ? "1 month" : `${m} months`;
  if (m === 0) return y === 1 ? "1 year" : `${y} years`;
  return `${y} year${y > 1 ? "s" : ""}, ${m} month${m > 1 ? "s" : ""}`;
}

export default function EmployeeDetailPage() {
  const { name } = useParams<{ name: string }>();
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewDate, setReviewDate] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidate = useInvalidate();
  const { mutateAsync: updateEmployee } = useUpdate();

  const { result: employee } = useOne<Employee>({ resource: "Employee", id: name! });

  // Leave allocations for this employee (submitted)
  const { result: allocsResult } = useList({
    resource: "Leave Allocation",
    pagination: { mode: "off" },
    filters: [
      { field: "employee", operator: "eq", value: name },
      { field: "docstatus", operator: "eq", value: 1 },
    ],
    meta: {
      fields: ["name", "employee", "leave_type", "total_leaves_allocated", "new_leaves_allocated"],
    },
    queryOptions: { enabled: !!name },
  });

  // Approved leave applications for this employee
  const { result: appsResult } = useList({
    resource: "Leave Application",
    pagination: { mode: "off" },
    filters: [
      { field: "employee", operator: "eq", value: name },
      { field: "status", operator: "eq", value: "Approved" },
      { field: "docstatus", operator: "eq", value: 1 },
    ],
    meta: { fields: ["name", "employee", "leave_type", "total_leave_days"] },
    queryOptions: { enabled: !!name },
  });

  const allocations = (allocsResult?.data ?? []) as any[];
  const applications = (appsResult?.data ?? []) as any[];

  // Calculate leave balance
  const leaveBalance = useMemo(() => {
    let allocated = 0;
    let taken = 0;

    for (const alloc of allocations) {
      allocated += alloc.total_leaves_allocated ?? alloc.new_leaves_allocated ?? 0;
    }
    for (const app of applications) {
      taken += app.total_leave_days ?? 0;
    }

    return { allocated, taken, remaining: allocated - taken };
  }, [allocations, applications]);

  // Check if any commission is set
  const hasCommission = useMemo(() => {
    if (!employee) return false;
    return (
      (employee.custom_lead_commission_pct ?? 0) > 0 ||
      (employee.custom_support_commission_pct ?? 0) > 0 ||
      (employee.custom_assistant_commission_pct ?? 0) > 0 ||
      (employee.custom_sales_commission_pct ?? 0) > 0
    );
  }, [employee]);

  function openReviewDialog() {
    if (!employee) return;
    setReviewDate(employee.custom_last_review_date || new Date().toISOString().split("T")[0]);
    setReviewNotes(employee.custom_review_notes || "");
    setError(null);
    setReviewDialogOpen(true);
  }

  async function handleSaveReview() {
    if (!employee || !reviewDate) return;
    setSaving(true);
    setError(null);
    try {
      await updateEmployee({
        resource: "Employee",
        id: employee.name,
        values: {
          custom_last_review_date: reviewDate,
          custom_review_notes: reviewNotes,
        },
      });
      invalidate({ resource: "Employee", invalidates: ["detail"] });
      setReviewDialogOpen(false);
    } catch (err: any) {
      setError(err?.message || "Failed to save review");
    } finally {
      setSaving(false);
    }
  }

  if (!employee) {
    return <DetailSkeleton />;
  }

  const staffRoles = parseStaffRoles(employee.custom_staff_roles);
  const reviewStatus = getReviewStatus(employee.custom_last_review_date);
  const reviewBadgeVariant = getReviewBadgeVariant(reviewStatus);
  const reviewStatusText = getReviewStatusText(employee.custom_last_review_date);
  const leaveBalanceVariant = getLeaveBalanceVariant(leaveBalance.remaining, leaveBalance.allocated);
  const leavePercent = leaveBalance.allocated > 0 ? (leaveBalance.remaining / leaveBalance.allocated) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{employee.employee_name}</h1>
          <Badge variant={employee.status === "Active" ? "success" : "secondary"}>
            {employee.status}
          </Badge>
        </div>
        {(employee.designation || employee.department) && (
          <p className="text-muted-foreground">
            {employee.designation}{employee.designation && employee.department && " · "}{employee.department}
          </p>
        )}
      </div>

      {/* Grid of Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Employee ID</span>
              <span className="font-mono text-sm">{employee.name}</span>
            </div>
            {employee.gender && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gender</span>
                <span>{employee.gender}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date of Birth</span>
              <span>{formatDate(employee.date_of_birth)}</span>
            </div>
            {employee.custom_meraki_id && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Meraki ID</span>
                <span>{employee.custom_meraki_id}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contact */}
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span>{employee.company_email || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone</span>
              <span>{employee.cell_phone || "-"}</span>
            </div>
            {employee.user_id && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">User Account</span>
                <span className="text-sm">{employee.user_id}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Employment */}
        <Card>
          <CardHeader>
            <CardTitle>Employment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Designation</span>
              <span>{employee.designation || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Department</span>
              <span>{employee.department || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date of Joining</span>
              <span>{formatDate(employee.date_of_joining)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tenure</span>
              <span>{calculateTenure(employee.date_of_joining)}</span>
            </div>
            {staffRoles.length > 0 && (
              <div className="flex justify-between items-start">
                <span className="text-muted-foreground">Staff Roles</span>
                <div className="flex gap-1 flex-wrap justify-end">
                  {staffRoles.map((role) => (
                    <Badge key={role} variant={getRoleBadgeVariant(role)}>
                      {role}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {employee.ctc != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">CTC</span>
                <span>{formatVND(employee.ctc)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Performance Review */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Performance Review</CardTitle>
            <Button size="sm" variant="outline" onClick={openReviewDialog}>
              <Pencil className="h-3 w-3 mr-1" />
              {employee.custom_last_review_date ? "Edit" : "Add"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Last Review</span>
              <span>{employee.custom_last_review_date ? formatDate(employee.custom_last_review_date) : "-"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Status</span>
              <Badge variant={reviewBadgeVariant}>{reviewStatusText}</Badge>
            </div>
            {employee.custom_review_notes && (
              <div className="pt-2 border-t">
                <span className="text-muted-foreground text-sm">Notes</span>
                <p className="mt-1 text-sm whitespace-pre-wrap">{employee.custom_review_notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Leave Balance */}
        <Card>
          <CardHeader>
            <CardTitle>Leave Balance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {leaveBalance.allocated > 0 ? (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Annual Leave</span>
                  <Badge variant={leaveBalanceVariant}>
                    {leaveBalance.remaining}/{leaveBalance.allocated} days
                  </Badge>
                </div>
                <Progress
                  value={leavePercent}
                  className="h-2"
                  indicatorClassName={
                    leavePercent > 50
                      ? "bg-green-500"
                      : leavePercent >= 25
                      ? "bg-amber-500"
                      : "bg-red-500"
                  }
                />
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Used: {leaveBalance.taken} days</span>
                  <span>Remaining: {leaveBalance.remaining} days</span>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">No leave allocation found</p>
            )}
          </CardContent>
        </Card>

        {/* Commission Structure (only if any commission > 0) */}
        {hasCommission && (
          <Card>
            <CardHeader>
              <CardTitle>Commission Structure</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(employee.custom_lead_commission_pct ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Lead Commission</span>
                  <span className="font-medium">{employee.custom_lead_commission_pct}%</span>
                </div>
              )}
              {(employee.custom_support_commission_pct ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Support Commission</span>
                  <span className="font-medium">{employee.custom_support_commission_pct}%</span>
                </div>
              )}
              {(employee.custom_assistant_commission_pct ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Assistant Commission</span>
                  <span className="font-medium">{employee.custom_assistant_commission_pct}%</span>
                </div>
              )}
              {(employee.custom_sales_commission_pct ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sales Commission</span>
                  <span className="font-medium">{employee.custom_sales_commission_pct}%</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Performance Review</DialogTitle>
            <DialogDescription>{employee.employee_name}</DialogDescription>
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
            {error && <p className="text-sm text-red-600">{error}</p>}
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
