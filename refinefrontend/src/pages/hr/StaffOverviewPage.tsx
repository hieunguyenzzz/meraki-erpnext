import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router";
import { usePermissions } from "@refinedev/core";
import type { ColumnDef } from "@tanstack/react-table";
import { Users, AlertCircle, Clock, CheckCircle, Pencil, Check, UserPlus, Copy, CheckCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { extractErrorMessage } from "@/lib/errors";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";
import { formatDate, displayName } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  getReviewBadgeVariant,
  type ReviewStatus,
} from "@/lib/review-status";
import { ASSIGNABLE_ROLES } from "@/lib/roles";
import { arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";

interface StaffRow {
  name: string;
  employee_name: string;
  first_name?: string;
  last_name?: string;
  designation: string;
  department: string;
  date_of_joining: string;
  custom_last_review_date?: string;
  custom_review_notes?: string;
  custom_display_order?: number;
  user_id?: string;
  staff_roles: string[];
  review_status: ReviewStatus;
  review_status_text: string;
  leave_allocated: number;
  leave_taken: number;
  leave_remaining: number;
}

interface StaffOverviewData {
  data: Array<{
    name: string;
    employee_name: string;
    display_name: string;
    first_name?: string;
    last_name?: string;
    designation: string;
    department: string;
    date_of_joining: string;
    custom_last_review_date?: string;
    custom_review_notes?: string;
    custom_display_order?: number;
    user_id?: string;
    custom_meraki_id?: number;
    review_status: ReviewStatus;
    review_status_text: string;
    leave_allocated: number;
    leave_taken: number;
    leave_remaining: number;
  }>;
  summary: {
    total: number;
    overdue: number;
    due_soon: number;
    up_to_date: number;
  };
}

type SummaryFilter = "all" | "overdue" | "due-soon" | "up-to-date";

export default function StaffOverviewPage() {
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>("all");
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [rolesDialogOpen, setRolesDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<StaffRow | null>(null);
  const [reviewDate, setReviewDate] = useState(new Date().toISOString().split("T")[0]);
  const [reviewNotes, setReviewNotes] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rolesMap, setRolesMap] = useState<Record<string, string[]>>({});

  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Unsaved-changes guard
  const [pendingClose, setPendingClose] = useState<(() => void) | null>(null);
  const [initialReviewDate, setInitialReviewDate] = useState("");
  const [initialReviewNotes, setInitialReviewNotes] = useState("");
  const [initialRoles, setInitialRoles] = useState<Set<string>>(new Set());

  function tryClose(isDirty: boolean, closeFn: () => void) {
    if (isDirty) setPendingClose(() => closeFn);
    else closeFn();
  }

  const { data: userRoles } = usePermissions<string[]>({});
  const canManageRoles = (userRoles ?? []).some(r => r === "System Manager" || r === "Administrator");

  // Invite staff dialog state
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    fullName: "",
    gender: "Female",
    dateOfBirth: "2000-01-01",
    dateOfJoining: new Date().toISOString().split("T")[0],
  });
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<{ password: string; name: string } | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  // Fetch staff overview from backend (replaces 3 separate useList calls)
  const [overviewData, setOverviewData] = useState<StaffOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchVersion, setFetchVersion] = useState(0);

  const refetch = useCallback(() => setFetchVersion((v) => v + 1), []);

  useEffect(() => {
    setIsLoading(true);
    fetch("/inquiry-api/staff/overview", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setOverviewData(data))
      .catch(() => setOverviewData(null))
      .finally(() => setIsLoading(false));
  }, [fetchVersion]);

  // Fetch roles map once overview loads
  useEffect(() => {
    if (!overviewData?.data?.length) return;
    fetch("/inquiry-api/employees/roles-map", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setRolesMap(data ?? {}))
      .catch(() => setRolesMap({}));
  }, [overviewData?.data?.length]);

  // Build staff rows from backend data + roles map
  const staffData: StaffRow[] = useMemo(() => {
    if (!overviewData?.data) return [];
    return overviewData.data.map((emp) => ({
      name: emp.name,
      employee_name: emp.employee_name,
      first_name: emp.first_name,
      last_name: emp.last_name,
      designation: emp.designation,
      department: emp.department,
      date_of_joining: emp.date_of_joining,
      custom_last_review_date: emp.custom_last_review_date,
      custom_review_notes: emp.custom_review_notes,
      custom_display_order: emp.custom_display_order,
      user_id: emp.user_id,
      staff_roles: rolesMap[emp.name] ?? [],
      review_status: emp.review_status as ReviewStatus,
      review_status_text: emp.review_status_text,
      leave_allocated: emp.leave_allocated,
      leave_taken: emp.leave_taken,
      leave_remaining: emp.leave_remaining,
    }));
  }, [overviewData, rolesMap]);

  // Initialize orderedIds from custom_display_order when data first loads
  useEffect(() => {
    if (staffData.length > 0) {
      const sorted = [...staffData].sort((a, b) => {
        const oa = a.custom_display_order || 0;
        const ob = b.custom_display_order || 0;
        if (oa === 0 && ob === 0) return (a.employee_name || "").localeCompare(b.employee_name || "");
        if (oa === 0) return 1;
        if (ob === 0) return -1;
        return oa - ob;
      });
      setOrderedIds(sorted.map((e) => e.name));
    }
  }, [staffData]);

  // Compute ordered staff list from orderedIds
  const orderedStaff = useMemo(() => {
    const map = Object.fromEntries(staffData.map((e) => [e.name, e]));
    return orderedIds.map((id) => map[id]).filter(Boolean) as StaffRow[];
  }, [orderedIds, staffData]);

  // Debounced save of order to ERPNext
  function saveOrderDebounced(ids: string[]) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await fetch("/inquiry-api/employee-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: ids.map((id, index) => ({ employee: id, order: index + 1 })) }),
      });
    }, 400);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrderedIds((ids) => {
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      const next = arrayMove(ids, oldIndex, newIndex);
      saveOrderDebounced(next);
      return next;
    });
  }

  // Summary counts from backend
  const summary = overviewData?.summary ?? { total: 0, overdue: 0, due_soon: 0, up_to_date: 0 };

  // Filter data by summary card selection
  const filteredData = useMemo(() => {
    if (summaryFilter === "all") return orderedStaff;
    return orderedStaff.filter((row) => {
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
  }, [orderedStaff, summaryFilter]);

  // Handle adding review
  function openReviewDialog(employee: StaffRow) {
    const date = employee.custom_last_review_date || new Date().toISOString().split("T")[0];
    const notes = employee.custom_review_notes || "";
    setSelectedEmployee(employee);
    setReviewDate(date);
    setReviewNotes(notes);
    setInitialReviewDate(date);
    setInitialReviewNotes(notes);
    setError(null);
    setReviewDialogOpen(true);
  }

  async function handleSaveReview() {
    if (!selectedEmployee || !reviewDate) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/inquiry-api/employee/${selectedEmployee.name}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: { custom_last_review_date: reviewDate, custom_review_notes: reviewNotes } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `API error ${res.status}`);
      }
      refetch();
      setReviewDialogOpen(false);
      setSelectedEmployee(null);
    } catch (err: any) {
      setError(err?.message || "Failed to save review");
    } finally {
      setSaving(false);
    }
  }

  // Handle roles dialog
  function openRolesDialog(employee: StaffRow) {
    if (!canManageRoles) return;
    const roles = new Set<string>(employee.staff_roles);
    setSelectedEmployee(employee);
    setSelectedRoles(roles);
    setInitialRoles(new Set(employee.staff_roles));
    setError(null);
    setRolesDialogOpen(true);
  }

  function toggleRole(role: string) {
    setSelectedRoles(prev => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }

  async function handleSaveRoles() {
    if (!selectedEmployee) return;
    setSaving(true);
    setError(null);
    try {
      const roles = Array.from(selectedRoles);

      const res = await fetch(`/inquiry-api/employee/${selectedEmployee.name}/set-roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `API error ${res.status}`);
      }

      // Update local rolesMap immediately
      setRolesMap((prev) => ({ ...prev, [selectedEmployee.name]: roles }));

      refetch();
      setRolesDialogOpen(false);
      setSelectedEmployee(null);
    } catch (err: any) {
      setError(err?.message || "Failed to save roles");
    } finally {
      setSaving(false);
    }
  }

  // Reset invite form when dialog closes
  useEffect(() => {
    if (!inviteDialogOpen) {
      setInviteForm({
        email: "",
        fullName: "",
        gender: "Female",
        dateOfBirth: "2000-01-01",
        dateOfJoining: new Date().toISOString().split("T")[0],
      });
      setInviteError(null);
      setInviteSuccess(null);
      setCopiedPassword(false);
    }
  }, [inviteDialogOpen]);

  async function handleInviteStaff() {
    if (!inviteForm.email.trim() || !inviteForm.fullName.trim()) return;
    setInviteSubmitting(true);
    setInviteError(null);

    try {
      const resp = await fetch("/inquiry-api/staff/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: inviteForm.fullName.trim(),
          email: inviteForm.email.trim(),
          gender: inviteForm.gender,
          date_of_birth: inviteForm.dateOfBirth,
          date_of_joining: inviteForm.dateOfJoining,
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        const detail = errData.detail;
        const msg = Array.isArray(detail)
          ? detail.map((d: any) => d.msg || JSON.stringify(d)).join(", ")
          : detail || `Failed to invite staff (${resp.status})`;
        throw new Error(msg);
      }

      const result = await resp.json();
      refetch();
      setInviteSuccess({ password: result.password, name: inviteForm.fullName.trim() });
    } catch (err: unknown) {
      setInviteError(extractErrorMessage(err, "Failed to invite staff member"));
    } finally {
      setInviteSubmitting(false);
    }
  }

  function copyPassword() {
    if (inviteSuccess?.password) {
      navigator.clipboard.writeText(inviteSuccess.password);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    }
  }

  // Table columns
  const columns: ColumnDef<StaffRow, unknown>[] = [
    {
      accessorKey: "employee_name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => (
        <Link to={`/hr/employees/${row.original.name}`} className="font-medium text-primary hover:underline">
          {displayName(row.original)}
        </Link>
      ),
      filterFn: (row, _id, filterValue) => {
        const name = displayName(row.original).toLowerCase();
        return name.includes((filterValue as string).toLowerCase());
      },
    },
    {
      accessorKey: "user_id",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.user_id || "\u2014"}</span>
      ),
    },
    {
      accessorKey: "designation",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
    },
    {
      id: "staff_roles",
      accessorFn: (row) => row.staff_roles.join(","),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Roles" />,
      cell: ({ row }) => {
        const assignedRoles = ASSIGNABLE_ROLES.filter((r) => row.original.staff_roles.includes(r.role));
        return (
          <div className="flex gap-1 flex-wrap items-center">
            {assignedRoles.length > 0 ? (
              assignedRoles.map((r) => (
                <Badge key={r.role} variant={r.variant as any}>{r.label}</Badge>
              ))
            ) : (
              <span className="text-muted-foreground text-sm">\u2014</span>
            )}
            {canManageRoles && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 ml-1"
                onClick={() => openRolesDialog(row.original)}
              >
                <Pencil className="h-3 w-3" />
              </Button>
            )}
          </div>
        );
      },
      filterFn: (row, _id, filterValue) => {
        if (!filterValue || filterValue.length === 0) return true;
        const roles = row.original.staff_roles;
        return filterValue.some((v: string) => roles.includes(v));
      },
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
        return <Badge variant={variant}>{row.original.review_status_text}</Badge>;
      },
      filterFn: "arrIncludesSome",
    },
  ];

  const isReviewDirty = reviewDate !== initialReviewDate || reviewNotes !== initialReviewNotes;
  const isRolesDirty = [...selectedRoles].sort().join(",") !== [...initialRoles].sort().join(",");
  const isInviteDirty = !inviteSuccess && (inviteForm.email.trim() !== "" || inviteForm.fullName.trim() !== "");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff Overview</h1>
          <p className="text-muted-foreground">Employee status, reviews, and leave balances at a glance</p>
        </div>
        <Button onClick={() => setInviteDialogOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Invite Staff
        </Button>
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
            <div className="text-2xl font-bold">{summary.total}</div>
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
            <div className="text-2xl font-bold text-red-600">{summary.overdue}</div>
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
            <div className="text-2xl font-bold text-amber-600">{summary.due_soon}</div>
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
            <div className="text-2xl font-bold text-green-600">{summary.up_to_date}</div>
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
        getRowId={(row: StaffRow) => row.name}
        sortable
        sortableItems={filteredData.map((r) => r.name)}
        onDragEnd={handleDragEnd}
        filterableColumns={[
          {
            id: "staff_roles",
            title: "Role",
            options: ASSIGNABLE_ROLES.map((r) => ({ label: r.label, value: r.role })),
          },
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

      {/* Review Sheet */}
      <Sheet open={reviewDialogOpen} onOpenChange={(open) => { if (!open) tryClose(isReviewDirty, () => setReviewDialogOpen(false)); }}>
        <SheetContent side="right" className="sm:max-w-md flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle>Review</SheetTitle>
            {selectedEmployee && (
              <p className="text-sm text-muted-foreground">{displayName(selectedEmployee)}</p>
            )}
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
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
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

      {/* Roles Sheet */}
      <Sheet open={rolesDialogOpen} onOpenChange={(open) => { if (!open) tryClose(isRolesDirty, () => setRolesDialogOpen(false)); }}>
        <SheetContent side="right" className="sm:max-w-md flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle>Assign Roles</SheetTitle>
            {selectedEmployee && (
              <p className="text-sm text-muted-foreground">{displayName(selectedEmployee)}</p>
            )}
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1">
            {ASSIGNABLE_ROLES.map((r) => (
              <div
                key={r.role}
                className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-muted/50"
                onClick={() => toggleRole(r.role)}
              >
                <div className={cn(
                  "h-5 w-5 rounded border-2 flex items-center justify-center transition-colors",
                  selectedRoles.has(r.role)
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-muted-foreground/30"
                )}>
                  {selectedRoles.has(r.role) && <Check className="h-3 w-3" />}
                </div>
                <Badge variant={r.variant as any}>{r.label}</Badge>
                <span className="text-sm text-muted-foreground">{r.role}</span>
              </div>
            ))}
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
          <SheetFooter className="px-6 py-4 border-t shrink-0">
            <Button variant="outline" onClick={() => setRolesDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSaveRoles} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Unsaved Changes Confirmation */}
      <Dialog open={pendingClose !== null} onOpenChange={(open) => { if (!open) setPendingClose(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Discard changes?</DialogTitle>
            <DialogDescription>You have unsaved changes. If you leave now they will be lost.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingClose(null)}>Keep editing</Button>
            <Button variant="destructive" onClick={() => { pendingClose?.(); setPendingClose(null); }}>Discard</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Staff Sheet */}
      <Sheet open={inviteDialogOpen} onOpenChange={(open) => { if (!open) tryClose(isInviteDirty, () => setInviteDialogOpen(false)); }}>
        <SheetContent side="right" className="sm:max-w-lg flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle>Invite Staff</SheetTitle>
            <p className="text-sm text-muted-foreground">
              Create a new employee account. They'll complete their profile on first login.
            </p>
          </SheetHeader>

          {inviteSuccess ? (
            <>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle className="h-5 w-5" />
                    <p className="font-medium">{inviteSuccess.name} has been added</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Share these login credentials:</p>
                    <div className="flex items-center gap-2 bg-white rounded border px-3 py-2">
                      <code className="flex-1 text-sm font-mono">{inviteSuccess.password}</code>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={copyPassword}>
                        {copiedPassword ? <CheckCheck className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              <SheetFooter className="px-6 py-4 border-t shrink-0">
                <Button onClick={() => setInviteDialogOpen(false)}>Done</Button>
              </SheetFooter>
            </>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email <span className="text-destructive">*</span></Label>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="staff@example.com"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invite-name">Full Name <span className="text-destructive">*</span></Label>
                  <Input
                    id="invite-name"
                    placeholder="e.g. Nguyen Thi Mai"
                    value={inviteForm.fullName}
                    onChange={(e) => setInviteForm(prev => ({ ...prev, fullName: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="invite-gender">Gender <span className="text-destructive">*</span></Label>
                    <Select
                      value={inviteForm.gender}
                      onValueChange={(value) => setInviteForm(prev => ({ ...prev, gender: value }))}
                    >
                      <SelectTrigger id="invite-gender">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Female">Female</SelectItem>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="invite-dob">Date of Birth <span className="text-destructive">*</span></Label>
                    <Input
                      id="invite-dob"
                      type="date"
                      value={inviteForm.dateOfBirth}
                      onChange={(e) => setInviteForm(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invite-doj">Date of Joining</Label>
                  <Input
                    id="invite-doj"
                    type="date"
                    value={inviteForm.dateOfJoining}
                    onChange={(e) => setInviteForm(prev => ({ ...prev, dateOfJoining: e.target.value }))}
                  />
                </div>

                {inviteError && (
                  <p className="text-sm text-red-600">{inviteError}</p>
                )}
              </div>
              <SheetFooter className="px-6 py-4 border-t shrink-0">
                <Button variant="outline" onClick={() => setInviteDialogOpen(false)} disabled={inviteSubmitting}>
                  Cancel
                </Button>
                <Button
                  onClick={handleInviteStaff}
                  disabled={inviteSubmitting || !inviteForm.email.trim() || !inviteForm.fullName.trim()}
                >
                  {inviteSubmitting ? "Creating..." : "Create Account"}
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
