import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "react-router";
import { useList, useCreate, useInvalidate, usePermissions } from "@refinedev/core";
import type { ColumnDef } from "@tanstack/react-table";
import { Users, AlertCircle, Clock, CheckCircle, Pencil, Check, UserPlus, Copy, CheckCheck, GripVertical } from "lucide-react";
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
  getReviewStatus,
  getReviewBadgeVariant,
  getReviewStatusText,
  getLeaveBalanceVariant,
  type ReviewStatus,
} from "@/lib/review-status";
import {
  STAFF_ROLES,
  type StaffRole,
  parseStaffRoles,
  serializeStaffRoles,
  getRoleBadgeVariant,
} from "@/lib/staff-roles";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  custom_staff_roles?: string;
  custom_display_order?: number;
  user_id?: string;
  staff_roles: StaffRole[];
  review_status: ReviewStatus;
  leave_allocated: number;
  leave_taken: number;
  leave_remaining: number;
}


function SortableStaffRow({ emp, onEdit }: { emp: StaffRow; onEdit: (emp: StaffRow) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: emp.name });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 p-3 bg-card border rounded-md mb-2">
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground hover:text-foreground touch-none"
        type="button"
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <span className="flex-1 font-medium">{displayName(emp)}</span>
      <span className="text-sm text-muted-foreground">{emp.designation || "-"}</span>
    </div>
  );
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

  // Arrange mode state
  const [arrangeMode, setArrangeMode] = useState(false);
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

  const invalidate = useInvalidate();
  const { mutateAsync: createDoc } = useCreate();

  // DnD sensors
  const sensors = useSensors(useSensor(PointerSensor));

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
        "first_name",
        "last_name",
        "designation",
        "department",
        "date_of_joining",
        "custom_last_review_date",
        "custom_review_notes",
        "custom_staff_roles",
        "custom_display_order",
        "user_id",
        "custom_meraki_id",
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
        first_name: emp.first_name,
        last_name: emp.last_name,
        designation: emp.designation || "-",
        department: emp.department || "-",
        date_of_joining: emp.date_of_joining,
        custom_last_review_date: emp.custom_last_review_date,
        custom_review_notes: emp.custom_review_notes,
        custom_staff_roles: emp.custom_staff_roles,
        custom_display_order: emp.custom_display_order,
        user_id: emp.user_id,
        staff_roles: parseStaffRoles(emp.custom_staff_roles),
        review_status: getReviewStatus(emp.custom_last_review_date),
        leave_allocated: allocated,
        leave_taken: taken,
        leave_remaining: allocated - taken,
      };
    });
  }, [employees, allocByEmployee, takenByEmployee]);

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

  function handleDragEnd(event: any) {
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

  // Filter data by summary card selection — based on orderedStaff to preserve custom order
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
      invalidate({ resource: "Employee", invalidates: ["list"] });
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
    setInitialRoles(roles);
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
      const staffRoles = Array.from(selectedRoles) as StaffRole[];

      // Save staff roles to Employee via custom endpoint (bypasses ERPNext link validation)
      const res = await fetch(`/inquiry-api/employee/${selectedEmployee.name}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: { custom_staff_roles: serializeStaffRoles(staffRoles) } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `API error ${res.status}`);
      }

      // Sync ERPNext User roles via backend (uses admin API key — no CSRF issues)
      if (selectedEmployee.user_id) {
        const syncRes = await fetch("/inquiry-api/sync-user-roles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: selectedEmployee.user_id, staff_roles: staffRoles }),
        });
        if (!syncRes.ok) {
          const data = await syncRes.json().catch(() => ({}));
          throw new Error(data.detail || `Failed to sync user roles (${syncRes.status})`);
        }
      }

      invalidate({ resource: "Employee", invalidates: ["list"] });
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
      // Generate password
      const password = `Meraki-${Math.floor(1000 + Math.random() * 9000)}`;

      // Step 1: Create User via fetch (need roles array)
      const userRes = await fetch("/api/resource/User", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Frappe-Site-Name": "erp.merakiwp.com",
        },
        credentials: "include",
        body: JSON.stringify({
          email: inviteForm.email.trim(),
          first_name: inviteForm.fullName.trim().split(" ")[0],
          last_name: inviteForm.fullName.trim().split(" ").slice(1).join(" ") || undefined,
          enabled: 1,
          new_password: password,
          send_welcome_email: 0,
          roles: [{ role: "Employee Self Service" }],
        }),
      });

      if (!userRes.ok) {
        const errData = await userRes.json().catch(() => null);
        const msg = errData?._server_messages
          ? extractErrorMessage(errData, "Failed to create user")
          : errData?.message || `Failed to create user (${userRes.status})`;
        throw new Error(msg);
      }

      // Step 2: Compute next custom_meraki_id
      const nextMerakiId = Math.max(0, ...employees.map((e: any) => parseInt(e.custom_meraki_id) || 0)) + 1;

      // Step 3: Create Employee
      await createDoc({
        resource: "Employee",
        values: {
          first_name: inviteForm.fullName.trim().split(" ")[0],
          employee_name: inviteForm.fullName.trim(),
          company: "Meraki Wedding Planner",
          user_id: inviteForm.email.trim(),
          date_of_joining: inviteForm.dateOfJoining,
          gender: inviteForm.gender,
          date_of_birth: inviteForm.dateOfBirth,
          status: "Active",
          custom_meraki_id: nextMerakiId,
        },
      });

      // Success
      invalidate({ resource: "Employee", invalidates: ["list"] });
      setInviteSuccess({ password, name: inviteForm.fullName.trim() });
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
      accessorKey: "designation",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
    },
    {
      id: "staff_roles",
      accessorFn: (row) => row.staff_roles.join(","),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Staff Roles" />,
      cell: ({ row }) => (
        <div className="flex gap-1 flex-wrap items-center">
          {row.original.staff_roles.length > 0 ? (
            row.original.staff_roles.map(role => (
              <Badge key={role} variant={getRoleBadgeVariant(role)}>{role}</Badge>
            ))
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
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
      ),
      filterFn: (row, id, filterValue) => {
        if (!filterValue || filterValue.length === 0) return true;
        const roles = row.original.staff_roles;
        return filterValue.some((v: string) => roles.includes(v as StaffRole));
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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setArrangeMode(v => !v)}>
            <GripVertical className="h-4 w-4 mr-1" />
            {arrangeMode ? "Done" : "Arrange Order"}
          </Button>
          <Button onClick={() => setInviteDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Invite Staff
          </Button>
        </div>
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

      {/* Staff Table or Arrange Mode */}
      {arrangeMode ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {orderedStaff.map((emp) => (
                <SortableStaffRow key={emp.name} emp={emp} onEdit={openReviewDialog} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <DataTable
          columns={columns}
          data={filteredData}
          isLoading={isLoading}
          searchKey="employee_name"
          searchPlaceholder="Search by name..."
          filterableColumns={[
            {
              id: "staff_roles",
              title: "Staff Role",
              options: STAFF_ROLES.map(role => ({ label: role, value: role })),
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
      )}

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
            <SheetTitle>Assign Staff Roles</SheetTitle>
            {selectedEmployee && (
              <p className="text-sm text-muted-foreground">{displayName(selectedEmployee)}</p>
            )}
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {STAFF_ROLES.map(role => (
              <div
                key={role}
                className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-muted/50"
                onClick={() => toggleRole(role)}
              >
                <div className={cn(
                  "h-5 w-5 rounded border-2 flex items-center justify-center transition-colors",
                  selectedRoles.has(role)
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-muted-foreground/30"
                )}>
                  {selectedRoles.has(role) && <Check className="h-3 w-3" />}
                </div>
                <Badge variant={getRoleBadgeVariant(role)}>{role}</Badge>
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
