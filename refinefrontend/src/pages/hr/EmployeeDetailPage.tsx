import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router";
import { useOne, useList, useUpdate, useInvalidate, useCustomMutation } from "@refinedev/core";
import { ArrowLeft, Pencil } from "lucide-react";
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
import { parseStaffRoles, getRoleBadgeVariant, serializeStaffRoles, STAFF_ROLES, syncUserRoles } from "@/lib/staff-roles";
import type { StaffRole } from "@/lib/staff-roles";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const navigate = useNavigate();
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewDate, setReviewDate] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [leaveAllocEdit, setLeaveAllocEdit] = useState<{ name: string; allocated: number; taken: number } | null>(null);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  type EditSection = "personal" | "contact" | "employment";
  const [editSection, setEditSection] = useState<EditSection | null>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const invalidate = useInvalidate();
  const { mutateAsync: updateEmployee } = useUpdate();
  const { mutateAsync: customMutation } = useCustomMutation();

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

  function openLeaveDialog() {
    if (allocations.length === 0) return;
    const alloc = allocations[0];
    const allocated = alloc.total_leaves_allocated ?? alloc.new_leaves_allocated ?? 0;
    const taken = leaveBalance.taken;
    setLeaveAllocEdit({ name: alloc.name, allocated, taken });
    setLeaveError(null);
    setLeaveDialogOpen(true);
  }

  async function handleSaveLeave() {
    if (!leaveAllocEdit) return;
    setLeaveSaving(true);
    setLeaveError(null);
    try {
      await customMutation({
        url: "/api/method/frappe.client.set_value",
        method: "post",
        values: {
          doctype: "Leave Allocation",
          name: leaveAllocEdit.name,
          fieldname: "new_leaves_allocated",
          value: leaveAllocEdit.allocated,
        },
      });
      invalidate({ resource: "Leave Allocation", invalidates: ["list"] });
      setLeaveDialogOpen(false);
    } catch (err: any) {
      setLeaveError(err?.message || "Failed to update leave allocation");
    } finally {
      setLeaveSaving(false);
    }
  }

  function openEdit(section: EditSection) {
    if (!employee) return;
    setEditError(null);
    if (section === "personal") {
      setEditValues({
        gender: employee.gender || "",
        date_of_birth: employee.date_of_birth || "",
        custom_meraki_id: employee.custom_meraki_id || "",
      });
    } else if (section === "contact") {
      setEditValues({
        company_email: employee.company_email || "",
        cell_phone: employee.cell_phone || "",
      });
    } else {
      setEditValues({
        designation: employee.designation || "",
        department: employee.department || "",
        date_of_joining: employee.date_of_joining || "",
        custom_staff_roles: employee.custom_staff_roles || "",
        ctc: employee.ctc ?? "",
      });
    }
    setEditSection(section);
  }

  async function handleSaveEdit() {
    if (!employee || !editSection) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const values = { ...editValues };
      // Convert ctc to number if present
      if ("ctc" in values && values.ctc !== "") {
        values.ctc = Number(values.ctc);
      }
      await updateEmployee({
        resource: "Employee",
        id: employee.name,
        values,
      });
      // Sync user roles if staff roles changed
      if (editSection === "employment" && employee.user_id && values.custom_staff_roles !== employee.custom_staff_roles) {
        const newRoles = parseStaffRoles(values.custom_staff_roles) as StaffRole[];
        await syncUserRoles(employee.user_id, newRoles);
      }
      invalidate({ resource: "Employee", invalidates: ["detail"] });
      setEditSection(null);
    } catch (err: any) {
      setEditError(err?.message || "Failed to save");
    } finally {
      setEditSaving(false);
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
        <Button variant="ghost" size="sm" className="-ml-2 mb-1" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
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
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Personal Information</CardTitle>
            <Button size="sm" variant="outline" onClick={() => openEdit("personal")}>
              <Pencil className="h-3 w-3 mr-1" />
              Edit
            </Button>
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
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Contact</CardTitle>
            <Button size="sm" variant="outline" onClick={() => openEdit("contact")}>
              <Pencil className="h-3 w-3 mr-1" />
              Edit
            </Button>
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
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Employment</CardTitle>
            <Button size="sm" variant="outline" onClick={() => openEdit("employment")}>
              <Pencil className="h-3 w-3 mr-1" />
              Edit
            </Button>
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
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Leave Balance</CardTitle>
            {leaveBalance.allocated > 0 && (
              <Button size="sm" variant="outline" onClick={openLeaveDialog}>
                <Pencil className="h-3 w-3 mr-1" />
                Edit
              </Button>
            )}
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

      {/* Leave Balance Dialog */}
      <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Leave Balance</DialogTitle>
            <DialogDescription>{employee.employee_name}</DialogDescription>
          </DialogHeader>
          {leaveAllocEdit && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="leave-allocated">Allocated Days</Label>
                <Input
                  id="leave-allocated"
                  type="number"
                  min={0}
                  step={0.5}
                  value={leaveAllocEdit.allocated}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) setLeaveAllocEdit((prev) => prev ? { ...prev, allocated: v } : prev);
                  }}
                  disabled={leaveSaving}
                />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taken Days</span>
                <span>{leaveAllocEdit.taken}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Remaining</span>
                <span>{leaveAllocEdit.allocated - leaveAllocEdit.taken}</span>
              </div>
              {leaveError && <p className="text-sm text-red-600">{leaveError}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveDialogOpen(false)} disabled={leaveSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveLeave} disabled={leaveSaving}>
              {leaveSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Section Dialog */}
      <Dialog open={editSection !== null} onOpenChange={(open) => { if (!open) setEditSection(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editSection === "personal" ? "Edit Personal Information" : editSection === "contact" ? "Edit Contact" : "Edit Employment"}
            </DialogTitle>
            <DialogDescription>{employee.employee_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {editSection === "personal" && (
              <>
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <Select value={editValues.gender} onValueChange={(v) => setEditValues((prev) => ({ ...prev, gender: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-dob">Date of Birth</Label>
                  <Input id="edit-dob" type="date" value={editValues.date_of_birth} onChange={(e) => setEditValues((prev) => ({ ...prev, date_of_birth: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-meraki-id">Meraki ID</Label>
                  <Input id="edit-meraki-id" type="number" value={editValues.custom_meraki_id} onChange={(e) => setEditValues((prev) => ({ ...prev, custom_meraki_id: e.target.value }))} />
                </div>
              </>
            )}
            {editSection === "contact" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="edit-email">Email</Label>
                  <Input id="edit-email" type="email" value={editValues.company_email} onChange={(e) => setEditValues((prev) => ({ ...prev, company_email: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-phone">Phone</Label>
                  <Input id="edit-phone" type="tel" value={editValues.cell_phone} onChange={(e) => setEditValues((prev) => ({ ...prev, cell_phone: e.target.value }))} />
                </div>
              </>
            )}
            {editSection === "employment" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="edit-designation">Designation</Label>
                  <Input id="edit-designation" value={editValues.designation} onChange={(e) => setEditValues((prev) => ({ ...prev, designation: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-department">Department</Label>
                  <Input id="edit-department" value={editValues.department} onChange={(e) => setEditValues((prev) => ({ ...prev, department: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-doj">Date of Joining</Label>
                  <Input id="edit-doj" type="date" value={editValues.date_of_joining} onChange={(e) => setEditValues((prev) => ({ ...prev, date_of_joining: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Staff Roles</Label>
                  <div className="flex flex-wrap gap-2">
                    {STAFF_ROLES.map((role) => {
                      const currentRoles = parseStaffRoles(editValues.custom_staff_roles) as StaffRole[];
                      const isActive = currentRoles.includes(role);
                      return (
                        <Button
                          key={role}
                          type="button"
                          size="sm"
                          variant={isActive ? "default" : "outline"}
                          onClick={() => {
                            const updated = isActive ? currentRoles.filter((r) => r !== role) : [...currentRoles, role];
                            setEditValues((prev) => ({ ...prev, custom_staff_roles: serializeStaffRoles(updated) }));
                          }}
                        >
                          {role}
                        </Button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-ctc">CTC (VND)</Label>
                  <Input id="edit-ctc" type="number" value={editValues.ctc} onChange={(e) => setEditValues((prev) => ({ ...prev, ctc: e.target.value }))} />
                </div>
              </>
            )}
            {editError && <p className="text-sm text-red-600">{editError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSection(null)} disabled={editSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={editSaving}>
              {editSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
