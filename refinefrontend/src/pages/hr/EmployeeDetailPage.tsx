import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router";
import { useOne, useList, useUpdate, useInvalidate, useCustomMutation } from "@refinedev/core";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Pencil } from "lucide-react";
import { formatDate, formatVND } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { DetailSkeleton } from "@/components/detail-skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

  type EditSection = "personal" | "contact" | "employment" | "commission";
  const [editSection, setEditSection] = useState<EditSection | null>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [processingId, setProcessingId] = useState<string | null>(null);
  const [recordsError, setRecordsError] = useState<string | null>(null);

  // Review scheduling state
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [reviewForm, setReviewForm] = useState({ date: "", time: "09:00", notes: "", participants: [] as string[] });
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const invalidate = useInvalidate();
  const { mutateAsync: updateEmployee } = useUpdate();
  const { mutateAsync: customMutation } = useCustomMutation();

  const { result: employee } = useOne<Employee>({ resource: "Employee", id: name! });

  // Active users for leave approver dropdown
  const { result: usersResult } = useList({
    resource: "User",
    pagination: { mode: "off" },
    filters: [{ field: "enabled", operator: "eq", value: 1 }],
    meta: { fields: ["name", "full_name", "email"] },
  });
  const users = (usersResult?.data ?? []) as any[];

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

  // All leave applications for this employee (for history tab)
  const { result: leaveHistoryResult } = useList({
    resource: "Leave Application",
    pagination: { mode: "off" },
    filters: [{ field: "employee", operator: "eq", value: name }],
    sorters: [{ field: "from_date", order: "desc" }],
    meta: { fields: ["name", "leave_type", "from_date", "to_date", "total_leave_days", "status", "docstatus", "description"] },
    queryOptions: { enabled: !!name },
  });
  const leaveHistory = (leaveHistoryResult?.data ?? []) as any[];

  // All WFH requests for this employee
  const { result: wfhResult } = useList({
    resource: "Attendance Request",
    pagination: { mode: "off" },
    filters: [
      { field: "employee", operator: "eq", value: name },
      { field: "reason", operator: "eq", value: "Work From Home" },
    ],
    sorters: [{ field: "from_date", order: "desc" }],
    meta: { fields: ["name", "from_date", "to_date", "explanation", "docstatus"] },
    queryOptions: { enabled: !!name },
  });
  const wfhRequests = (wfhResult?.data ?? []) as any[];

  // Review history for this employee
  const { result: reviewsResult } = useList({
    resource: "Meraki Review",
    pagination: { mode: "off" },
    filters: [{ field: "employee", operator: "eq", value: name }],
    sorters: [{ field: "review_date", order: "desc" }],
    meta: { fields: ["name", "review_date", "review_time", "notes", "participants", "google_event_id"] },
    queryOptions: { enabled: !!name },
  });
  const reviews = (reviewsResult?.data ?? []) as any[];

  // All active employees (for participant selector)
  const { result: allEmployeesResult } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "eq", value: "Active" }],
    sorters: [{ field: "employee_name", order: "asc" }],
    meta: { fields: ["name", "employee_name"] },
  });
  const allEmployees = (allEmployeesResult?.data ?? []) as any[];

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
      invalidate({ resource: "Employee", id: employee.name, invalidates: ["detail"] });
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

  async function handleLeaveApprove(appName: string) {
    setProcessingId(appName); setRecordsError(null);
    try {
      await customMutation({ url: "/api/method/frappe.client.set_value", method: "post",
        values: { doctype: "Leave Application", name: appName, fieldname: "status", value: "Approved" } });
      await customMutation({ url: "/api/method/frappe.client.submit", method: "post",
        values: { doctype: "Leave Application", name: appName } });
      invalidate({ resource: "Leave Application", invalidates: ["list"] });
    } catch { setRecordsError(`Failed to approve ${appName}`); } finally { setProcessingId(null); }
  }

  async function handleLeaveReject(appName: string) {
    setProcessingId(appName); setRecordsError(null);
    try {
      await customMutation({ url: "/api/method/frappe.client.set_value", method: "post",
        values: { doctype: "Leave Application", name: appName, fieldname: "status", value: "Rejected" } });
      await customMutation({ url: "/api/method/frappe.client.submit", method: "post",
        values: { doctype: "Leave Application", name: appName } });
      invalidate({ resource: "Leave Application", invalidates: ["list"] });
    } catch { setRecordsError(`Failed to reject ${appName}`); } finally { setProcessingId(null); }
  }

  async function handleWFHApprove(reqName: string) {
    setProcessingId(reqName); setRecordsError(null);
    try {
      await customMutation({ url: "/api/method/frappe.client.submit", method: "post",
        values: { doctype: "Attendance Request", name: reqName } });
      invalidate({ resource: "Attendance Request", invalidates: ["list"] });
    } catch { setRecordsError(`Failed to approve ${reqName}`); } finally { setProcessingId(null); }
  }

  async function handleWFHReject(reqName: string) {
    setProcessingId(reqName); setRecordsError(null);
    try {
      await customMutation({ url: "/api/method/frappe.client.set_value", method: "post",
        values: { doctype: "Attendance Request", name: reqName, fieldname: "workflow_state", value: "Rejected" } });
      await customMutation({ url: "/api/method/frappe.client.submit", method: "post",
        values: { doctype: "Attendance Request", name: reqName } });
      invalidate({ resource: "Attendance Request", invalidates: ["list"] });
    } catch { setRecordsError(`Failed to reject ${reqName}`); } finally { setProcessingId(null); }
  }

  function openEdit(section: EditSection) {
    if (!employee) return;
    setEditError(null);
    if (section === "personal") {
      setEditValues({
        first_name: employee.first_name || "",
        middle_name: employee.middle_name || "",
        last_name: employee.last_name || "",
        gender: employee.gender || "",
        date_of_birth: employee.date_of_birth || "",
      });
    } else if (section === "contact") {
      setEditValues({
        company_email: employee.company_email || "",
        cell_phone: employee.cell_phone || "",
      });
    } else if (section === "commission") {
      setEditValues({
        custom_lead_commission_pct: employee.custom_lead_commission_pct ?? 0,
        custom_support_commission_pct: employee.custom_support_commission_pct ?? 0,
        custom_assistant_commission_pct: employee.custom_assistant_commission_pct ?? 0,
        custom_sales_commission_pct: employee.custom_sales_commission_pct ?? 0,
      });
    } else {
      setEditValues({
        designation: employee.designation || "",
        department: employee.department || "",
        date_of_joining: employee.date_of_joining || "",
        custom_staff_roles: employee.custom_staff_roles || "",
        ctc: employee.ctc ?? "",
        custom_insurance_salary: employee.custom_insurance_salary ?? "",
        leave_approver: employee.leave_approver || "",
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
      if ("custom_insurance_salary" in values && values.custom_insurance_salary !== "") {
        values.custom_insurance_salary = Number(values.custom_insurance_salary);
      }
      const commissionFields = ["custom_lead_commission_pct", "custom_support_commission_pct", "custom_assistant_commission_pct", "custom_sales_commission_pct"];
      for (const field of commissionFields) {
        if (field in values && values[field] !== "") {
          values[field] = Number(values[field]);
        }
      }
      const res = await fetch(`/inquiry-api/employee/${employee.name}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `API error ${res.status}`);
      }
      // Sync user roles if staff roles changed
      if (editSection === "employment" && employee.user_id && values.custom_staff_roles !== employee.custom_staff_roles) {
        const newRoles = parseStaffRoles(values.custom_staff_roles) as StaffRole[];
        await syncUserRoles(employee.user_id, newRoles);
      }
      invalidate({ resource: "Employee", id: employee.name, invalidates: ["detail"] });
      setEditSection(null);
    } catch (err: any) {
      setEditError(err?.message || "Failed to save");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleScheduleReview() {
    if (!reviewForm.date) return;
    setReviewSubmitting(true);
    setReviewError(null);
    try {
      const res = await fetch(`/inquiry-api/review/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          review_date: reviewForm.date,
          review_time: reviewForm.time,
          notes: reviewForm.notes,
          participants: reviewForm.participants,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `API error ${res.status}`);
      }
      invalidate({ resource: "Meraki Review", invalidates: ["list"] });
      invalidate({ resource: "Employee", id: name, invalidates: ["detail"] });
      setScheduleDialogOpen(false);
      setReviewForm({ date: "", time: "09:00", notes: "", participants: [] });
    } catch (e: any) {
      setReviewError(e?.message ?? "Failed to schedule review");
    } finally {
      setReviewSubmitting(false);
    }
  }

  function toggleParticipant(empId: string) {
    setReviewForm((prev) => ({
      ...prev,
      participants: prev.participants.includes(empId)
        ? prev.participants.filter((p) => p !== empId)
        : [...prev.participants, empId],
    }));
  }

  const pendingLeave = leaveHistory.filter((a) => a.docstatus === 0 && a.status === "Open").length;
  const pendingWFH = wfhRequests.filter((r) => r.docstatus === 0).length;
  const pendingCount = pendingLeave + pendingWFH;

  const [typeFilter, setTypeFilter] = useState<"all" | "leave" | "wfh">("all");

  const allRecords = useMemo(() => {
    const leaves = leaveHistory.map((a) => ({
      id: a.name,
      type: "leave" as const,
      from_date: a.from_date,
      to_date: a.to_date,
      days: a.total_leave_days,
      details: a.leave_type,
      status: a.docstatus === 0 && a.status === "Open" ? "Pending" : a.status,
      isPending: a.docstatus === 0 && a.status === "Open",
      raw: a,
    }));
    const wfhs = wfhRequests.map((r) => {
      const days =
        r.from_date && r.to_date
          ? Math.ceil((new Date(r.to_date).getTime() - new Date(r.from_date).getTime()) / 86400000) + 1
          : 1;
      const isPending = r.docstatus === 0;
      const status = r.docstatus === 1 ? "Approved" : "Pending";
      return {
        id: r.name,
        type: "wfh" as const,
        from_date: r.from_date,
        to_date: r.to_date,
        days,
        details: r.explanation || "-",
        status,
        isPending,
        raw: r,
      };
    });
    return [...leaves, ...wfhs].sort(
      (a, b) => new Date(b.from_date).getTime() - new Date(a.from_date).getTime()
    );
  }, [leaveHistory, wfhRequests]);

  const filteredRecords = useMemo(
    () => (typeFilter === "all" ? allRecords : allRecords.filter((r) => r.type === typeFilter)),
    [allRecords, typeFilter]
  );

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
          <h1 className="text-2xl font-bold tracking-tight">
            {[employee.first_name, employee.middle_name, employee.last_name].filter(Boolean).join(" ") || employee.employee_name}
          </h1>
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

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="records" className="flex items-center gap-1.5">
            Leave &amp; WFH
            {pendingCount > 0 && (
              <Badge variant="destructive" className="h-4 px-1 text-xs">{pendingCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="review">Review</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
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
                {employee.custom_insurance_salary != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Insurance Salary (BHXH)</span>
                    <span>{formatVND(employee.custom_insurance_salary)}</span>
                  </div>
                )}
                {employee.leave_approver && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Leave Approver</span>
                    <span>{users.find((u) => u.name === employee.leave_approver)?.full_name || employee.leave_approver}</span>
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

            {/* Commission Structure */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle>Commission Structure</CardTitle>
                <Button size="sm" variant="outline" onClick={() => openEdit("commission")}>
                  <Pencil className="h-3 w-3 mr-1" />
                  Edit
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {hasCommission ? (
                  <>
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
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">No commissions set</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="records" className="space-y-4">
          {recordsError && <p className="text-sm text-red-600">{recordsError}</p>}

          {/* Unified Leave & WFH History */}
          <Card>
            <CardHeader><CardTitle>Leave &amp; WFH History</CardTitle></CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                {(["all", "leave", "wfh"] as const).map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    variant={typeFilter === f ? "default" : "outline"}
                    onClick={() => setTypeFilter(f)}
                  >
                    {f === "all" ? "All" : f === "leave" ? "Leave" : "WFH"}
                  </Button>
                ))}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-8">
                        No records found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRecords.map((rec) => (
                      <TableRow key={rec.id}>
                        <TableCell>
                          <Badge variant={rec.type === "leave" ? "secondary" : "outline"}>
                            {rec.type === "leave" ? "Leave" : "WFH"}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(rec.from_date)}</TableCell>
                        <TableCell>{formatDate(rec.to_date)}</TableCell>
                        <TableCell>{rec.days}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{rec.details}</TableCell>
                        <TableCell>
                          <Badge variant={rec.status === "Approved" ? "default" : rec.status === "Rejected" ? "destructive" : "secondary"}>
                            {rec.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {rec.isPending && (
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" disabled={processingId === rec.id}
                                onClick={() => rec.type === "leave" ? handleLeaveApprove(rec.id) : handleWFHApprove(rec.id)}>
                                Approve
                              </Button>
                              <Button size="sm" variant="destructive" disabled={processingId === rec.id}
                                onClick={() => rec.type === "leave" ? handleLeaveReject(rec.id) : handleWFHReject(rec.id)}>
                                Reject
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="review" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-medium text-muted-foreground">Review History</h3>
            <Button size="sm" onClick={() => {
              setReviewForm({ date: new Date().toISOString().split("T")[0], time: "09:00", notes: "", participants: [] });
              setReviewError(null);
              setScheduleDialogOpen(true);
            }}>
              Schedule Review
            </Button>
          </div>

          <Card>
            <CardContent className="pt-4">
              {reviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">No reviews yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Participants</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Calendar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reviews.map((r) => {
                      const parts = (() => { try { return JSON.parse(r.participants || "[]"); } catch { return []; } })();
                      return (
                        <TableRow key={r.name}>
                          <TableCell>{formatDate(r.review_date)}</TableCell>
                          <TableCell>{r.review_time ? r.review_time.slice(0, 5) : "-"}</TableCell>
                          <TableCell className="text-sm">{parts.length > 0 ? parts.join(", ") : "-"}</TableCell>
                          <TableCell className="max-w-xs truncate text-sm">{r.notes || "-"}</TableCell>
                          <TableCell>
                            {r.google_event_id ? (
                              <span className="text-xs text-green-600">Synced</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Schedule Review Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Performance Review</DialogTitle>
            <p className="text-sm text-muted-foreground">{employee.employee_name}</p>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="schedule-date">Review Date</Label>
              <Input
                id="schedule-date"
                type="date"
                value={reviewForm.date}
                onChange={(e) => setReviewForm((p) => ({ ...p, date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-time">Time</Label>
              <Input
                id="schedule-time"
                type="time"
                value={reviewForm.time}
                onChange={(e) => setReviewForm((p) => ({ ...p, time: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-notes">Notes</Label>
              <Textarea
                id="schedule-notes"
                placeholder="Review agenda or notes..."
                value={reviewForm.notes}
                onChange={(e) => setReviewForm((p) => ({ ...p, notes: e.target.value }))}
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-2">
              <Label>Participants</Label>
              <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                {allEmployees.map((emp) => {
                  const isSelected = reviewForm.participants.includes(emp.name);
                  const isSelf = emp.name === name;
                  return (
                    <Button
                      key={emp.name}
                      type="button"
                      size="sm"
                      variant={isSelected ? "default" : "outline"}
                      className="w-full justify-start text-left h-8"
                      onClick={() => !isSelf && toggleParticipant(emp.name)}
                      disabled={isSelf}
                    >
                      {emp.employee_name}
                      {isSelf && <span className="ml-auto text-xs opacity-60">self</span>}
                    </Button>
                  );
                })}
              </div>
              {reviewForm.participants.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {reviewForm.participants.length} participant{reviewForm.participants.length > 1 ? "s" : ""} selected
                </p>
              )}
            </div>
            {reviewError && <p className="text-sm text-red-600">{reviewError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleDialogOpen(false)} disabled={reviewSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleScheduleReview} disabled={reviewSubmitting || !reviewForm.date}>
              {reviewSubmitting ? "Scheduling…" : "Schedule & Add to Calendar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Sheet */}
      <Sheet open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <SheetContent side="right" className="sm:max-w-md flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle>Performance Review</SheetTitle>
            <p className="text-sm text-muted-foreground">{employee.employee_name}</p>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
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
          <SheetFooter className="px-6 py-4 border-t shrink-0">
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSaveReview} disabled={saving || !reviewDate}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Leave Balance Sheet */}
      <Sheet open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <SheetContent side="right" className="sm:max-w-md flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle>Edit Leave Balance</SheetTitle>
            <p className="text-sm text-muted-foreground">{employee.employee_name}</p>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {leaveAllocEdit && (
              <>
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
              </>
            )}
          </div>
          <SheetFooter className="px-6 py-4 border-t shrink-0">
            <Button variant="outline" onClick={() => setLeaveDialogOpen(false)} disabled={leaveSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveLeave} disabled={leaveSaving}>
              {leaveSaving ? "Saving..." : "Save"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Edit Section Sheet */}
      <Sheet open={editSection !== null} onOpenChange={(open) => { if (!open) setEditSection(null); }}>
        <SheetContent side="right" className="sm:max-w-md flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle>
              {editSection === "personal" ? "Edit Personal Information" : editSection === "contact" ? "Edit Contact" : editSection === "commission" ? "Edit Commission Structure" : "Edit Employment"}
            </SheetTitle>
            <p className="text-sm text-muted-foreground">{employee.employee_name}</p>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {editSection === "personal" && (
              <>
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input
                    value={editValues.first_name ?? ""}
                    onChange={(e) => setEditValues({ ...editValues, first_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Middle Name</Label>
                  <Input
                    value={editValues.middle_name ?? ""}
                    onChange={(e) => setEditValues({ ...editValues, middle_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input
                    value={editValues.last_name ?? ""}
                    onChange={(e) => setEditValues({ ...editValues, last_name: e.target.value })}
                  />
                </div>
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
                <div className="space-y-2">
                  <Label htmlFor="edit-insurance-salary">Insurance Salary / BHXH (VND)</Label>
                  <Input id="edit-insurance-salary" type="number" value={editValues.custom_insurance_salary} onChange={(e) => setEditValues((prev) => ({ ...prev, custom_insurance_salary: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Leave Approver</Label>
                  <Select
                    value={editValues.leave_approver}
                    onValueChange={(v) => setEditValues((prev) => ({ ...prev, leave_approver: v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Select approver" /></SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.name} value={u.name}>{u.full_name || u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            {editSection === "commission" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="edit-lead-pct">Lead Commission (%)</Label>
                  <Input id="edit-lead-pct" type="number" min={0} max={100} step={0.1} value={editValues.custom_lead_commission_pct} onChange={(e) => setEditValues((prev) => ({ ...prev, custom_lead_commission_pct: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-support-pct">Support Commission (%)</Label>
                  <Input id="edit-support-pct" type="number" min={0} max={100} step={0.1} value={editValues.custom_support_commission_pct} onChange={(e) => setEditValues((prev) => ({ ...prev, custom_support_commission_pct: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-assistant-pct">Assistant Commission (%)</Label>
                  <Input id="edit-assistant-pct" type="number" min={0} max={100} step={0.1} value={editValues.custom_assistant_commission_pct} onChange={(e) => setEditValues((prev) => ({ ...prev, custom_assistant_commission_pct: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-sales-pct">Sales Commission (%)</Label>
                  <Input id="edit-sales-pct" type="number" min={0} max={100} step={0.1} value={editValues.custom_sales_commission_pct} onChange={(e) => setEditValues((prev) => ({ ...prev, custom_sales_commission_pct: e.target.value }))} />
                </div>
              </>
            )}
            {editError && <p className="text-sm text-red-600">{editError}</p>}
          </div>
          <SheetFooter className="px-6 py-4 border-t shrink-0">
            <Button variant="outline" onClick={() => setEditSection(null)} disabled={editSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={editSaving}>
              {editSaving ? "Saving..." : "Save"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
