import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useOne, useList, useUpdate, useInvalidate, useNavigation } from "@refinedev/core";
import * as Popover from "@radix-ui/react-popover";
import { formatDate, formatVND, displayName } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trash2,
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  DollarSign,
  Plus,
  Check,
  User,
  Clock,
  AlertCircle,
  Loader2,
  Pencil,
  ChevronsUpDown,
  X,
} from "lucide-react";
import {
  Popover as ShadcnPopover,
  PopoverContent as ShadcnPopoverContent,
  PopoverTrigger as ShadcnPopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DetailSkeleton } from "@/components/detail-skeleton";
import { ReadOnlyField } from "@/components/crm/ReadOnlyField";
import { InternalNotesSection } from "@/components/crm/ActivitySection";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const WEDDING_PHASES = [
  "Onboarding",
  "Planning",
  "Final Details",
  "Wedding Week",
  "Day-of",
  "Completed",
];

const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Urgent"];

function stageBadgeVariant(stage: string) {
  switch (stage) {
    case "Onboarding": return "info" as const;
    case "Planning": return "warning" as const;
    case "Final Details": return "info" as const;
    case "Wedding Week": return "destructive" as const;
    case "Day-of": return "secondary" as const;
    case "Completed": return "success" as const;
    default: return "secondary" as const;
  }
}

function statusVariant(status: string) {
  switch (status) {
    case "Open": return "warning" as const;
    case "Completed": return "success" as const;
    case "Cancelled": return "destructive" as const;
    default: return "secondary" as const;
  }
}

export default function ProjectDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [taskForm, setTaskForm] = useState({
    subject: "",
    phase: "",
    deadline: "",
    priority: "Medium",
    assignee: "",
  });
  const [sharedWith, setSharedWith] = useState<Set<string>>(new Set());

  // Payment milestone state
  const [addMilestoneOpen, setAddMilestoneOpen] = useState(false);
  const [isSubmittingMilestone, setIsSubmittingMilestone] = useState(false);
  const [milestoneError, setMilestoneError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [milestoneForm, setMilestoneForm] = useState({
    label: "",
    amount: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
  });

  // Edit state - per-section sheets
  const [editDetailsOpen, setEditDetailsOpen] = useState(false);
  const [editStaffOpen, setEditStaffOpen] = useState(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editVenueOpen, setEditVenueOpen] = useState(false);
  const [editVenueSearch, setEditVenueSearch] = useState("");
  const [editVenueDisplayName, setEditVenueDisplayName] = useState("");
  const [editForm, setEditForm] = useState({
    venue: "",
    leadPlanner: "",
    supportPlanner: "",
    assistant1: "",
    assistant2: "",
    assistant3: "",
    assistant4: "",
    assistant5: "",
    addOns: [] as { itemCode: string; itemName: string; qty: number; rate: number; includeInCommission: boolean }[],
  });
  const [editAddonSearch, setEditAddonSearch] = useState<string[]>([]);
  const [editAddonDropdownOpen, setEditAddonDropdownOpen] = useState<boolean[]>([]);

  // Allowance generation state
  const [allowanceDialogOpen, setAllowanceDialogOpen] = useState(false);
  const [allowancePreview, setAllowancePreview] = useState<{ created: any[]; skipped: any[] } | null>(null);
  const [allowanceLoading, setAllowanceLoading] = useState(false);
  const [allowanceSubmitting, setAllowanceSubmitting] = useState(false);
  const [allowanceError, setAllowanceError] = useState<string | null>(null);
  const [allowanceSuccess, setAllowanceSuccess] = useState<string | null>(null);

  const invalidate = useInvalidate();
  const { mutateAsync: updateRecord } = useUpdate();
  const { list } = useNavigation();

  // Fetch Project
  const { result: project } = useOne({
    resource: "Project",
    id: name!,
    meta: {
      fields: [
        "name",
        "project_name",
        "status",
        "custom_project_stage",
        "customer",
        "expected_start_date",
        "expected_end_date",
        "sales_order",
        "custom_lead_planner",
        "custom_support_planner",
        "custom_assistant_1",
        "custom_assistant_2",
        "custom_assistant_3",
        "custom_assistant_4",
        "custom_assistant_5",
      ],
    },
  });

  // Fetch linked Sales Order for wedding details
  const { result: salesOrderResult } = useOne({
    resource: "Sales Order",
    id: project?.sales_order!,
    meta: {
      fields: [
        "name",
        "customer_name",
        "grand_total",
        "custom_venue",
        "custom_commission_base",
        "delivery_date",
        "per_billed",
        "per_delivered",
        "status",
      ],
    },
    queryOptions: { enabled: !!project?.sales_order },
  });
  const salesOrder = salesOrderResult;

  // Fetch Customer info
  const { result: customerResult } = useOne({
    resource: "Customer",
    id: project?.customer!,
    meta: {
      fields: ["name", "customer_name", "mobile_no", "email_id"],
    },
    queryOptions: { enabled: !!project?.customer },
  });
  const customer = customerResult;

  // Fetch Sales Order items via the parent SO doc (Sales Order Item direct list returns 403)
  const [soItems, setSOItems] = useState<{ name: string; item_code: string; item_name: string; qty: number; rate: number; amount: number }[]>([]);

  const fetchSOItems = useCallback(async (soName: string) => {
    try {
      const res = await fetch(
        `/api/resource/Sales Order/${encodeURIComponent(soName)}`,
        { credentials: "include" }
      );
      const data = await res.json();
      setSOItems(data.data?.items ?? []);
    } catch {
      setSOItems([]);
    }
  }, []);

  useEffect(() => {
    if (project?.sales_order) fetchSOItems(project.sales_order);
  }, [project?.sales_order, fetchSOItems]);

  const addOnItems = useMemo(
    () => soItems.filter((i) => i.item_code !== "Wedding Planning Service"),
    [soItems]
  );

  // Fetch Sales Invoices linked to this Project via the `project` field
  // (sales_order is not a writable/filterable doc-level field on Sales Invoice)
  const [invoices, setInvoices] = useState<any[]>([]);

  const fetchInvoices = useCallback(async (projectName: string) => {
    try {
      const fields = JSON.stringify(["name", "grand_total", "outstanding_amount", "status", "due_date", "posting_date"]);
      const filters = JSON.stringify([["project", "=", projectName]]);
      const res = await fetch(
        `/api/resource/Sales Invoice?filters=${encodeURIComponent(filters)}&fields=${encodeURIComponent(fields)}&limit=100`,
        { credentials: "include" }
      );
      const data = await res.json();
      setInvoices(data.data ?? []);
    } catch {
      setInvoices([]);
    }
  }, []);

  useEffect(() => {
    if (name) fetchInvoices(name);
  }, [name, fetchInvoices]);

  // Fetch Tasks linked to this Project
  const { result: tasksResult } = useList({
    resource: "Task",
    pagination: { mode: "off" as const },
    filters: [{ field: "project", operator: "eq", value: name! }],
    sorters: [{ field: "creation", order: "desc" }],
    meta: {
      fields: [
        "name",
        "subject",
        "status",
        "priority",
        "exp_end_date",
        "custom_wedding_phase",
        "_assign",
        "custom_shared_with",
        "owner",
      ],
    },
    queryOptions: { enabled: !!name },
  });
  const tasks = tasksResult?.data ?? [];

  // Fetch Employees for task assignment and team display
  const { result: employeesResult } = useList({
    resource: "Employee",
    pagination: { mode: "off" as const },
    filters: [{ field: "status", operator: "eq", value: "Active" }],
    meta: { fields: ["name", "employee_name", "first_name", "last_name", "user_id"] },
  });
  const employees = (employeesResult?.data ?? []).map((e: any) => ({
    id: e.name,
    name: displayName(e),
    userId: e.user_id,
  }));

  // Fetch Venues (Suppliers in Wedding Venues group)
  const { result: venuesResult } = useList({
    resource: "Supplier",
    pagination: { mode: "off" as const },
    filters: [{ field: "supplier_group", operator: "eq", value: "Wedding Venues" }],
    meta: { fields: ["name", "supplier_name"] },
  });
  const venues = (venuesResult?.data ?? []) as { name: string; supplier_name: string }[];

  // Fetch available add-on items
  const { result: addOnItemsListResult } = useList({
    resource: "Item",
    pagination: { mode: "off" as const },
    filters: [{ field: "item_group", operator: "eq", value: "Add-on Services" }],
    meta: { fields: ["name", "item_name", "custom_include_in_commission"] },
  });
  const availableAddOns = (addOnItemsListResult?.data ?? []) as { name: string; item_name: string; custom_include_in_commission?: number }[];

  function getEmployeeNameById(id: string | null | undefined): string | null {
    if (!id) return null;
    const emp = employees.find((e) => e.id === id);
    return emp?.name || id;
  }

  // Populate details form (venue + add-ons)
  function populateDetailsForm() {
    if (!project) return;
    const currentAddOns = addOnItems.map((i) => {
      const itemMeta = availableAddOns.find((a) => a.name === i.item_code);
      return {
        itemCode: i.item_code,
        itemName: i.item_name,
        qty: i.qty,
        rate: i.rate,
        includeInCommission: !!(itemMeta?.custom_include_in_commission),
      };
    });
    setEditForm((prev) => ({
      ...prev,
      venue: salesOrder?.custom_venue || "",
      addOns: currentAddOns,
    }));
    setEditAddonSearch(currentAddOns.map((a) => a.itemName));
    setEditAddonDropdownOpen(currentAddOns.map(() => false));
    const v = venues.find((v) => v.name === salesOrder?.custom_venue);
    setEditVenueDisplayName(v?.supplier_name || salesOrder?.custom_venue || "");
  }

  // Populate staff form (lead/support/assistants)
  function populateStaffForm() {
    if (!project) return;
    setEditForm((prev) => ({
      ...prev,
      leadPlanner: project.custom_lead_planner || "",
      supportPlanner: project.custom_support_planner || "",
      assistant1: project.custom_assistant_1 || "",
      assistant2: project.custom_assistant_2 || "",
      assistant3: project.custom_assistant_3 || "",
      assistant4: project.custom_assistant_4 || "",
      assistant5: project.custom_assistant_5 || "",
    }));
  }

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmittingEdit(true);
    setEditError(null);
    try {
      const resp = await fetch(`/inquiry-api/wedding/${name}/details`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          venue: editForm.venue || null,
          addons: editForm.addOns.map((a) => ({
            item_code: a.itemCode,
            item_name: a.itemName,
            qty: a.qty,
            rate: a.rate,
            include_in_commission: a.includeInCommission,
          })),
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        const detail = err.detail;
        const msg = Array.isArray(detail)
          ? detail.map((d: any) => d.msg || JSON.stringify(d)).join(", ")
          : detail || "Failed to save details";
        throw new Error(msg);
      }
      invalidate({ resource: "Project", invalidates: ["detail"], id: name! });
      invalidate({ resource: "Sales Order", invalidates: ["detail"], id: project?.sales_order! });
      const updatedProject = await fetch(`/api/resource/Project/${name}`, { credentials: "include" }).then(r => r.json());
      const newSOName = updatedProject?.data?.sales_order;
      if (newSOName) fetchSOItems(newSOName);
      setEditDetailsOpen(false);
    } catch (err: any) {
      setEditError(err?.message || "Failed to save changes");
    } finally {
      setIsSubmittingEdit(false);
    }
  }

  async function handleSaveStaff(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmittingEdit(true);
    setEditError(null);
    try {
      await updateRecord({
        resource: "Project",
        id: name!,
        values: {
          custom_lead_planner: editForm.leadPlanner || null,
          custom_support_planner: editForm.supportPlanner || null,
          custom_assistant_1: editForm.assistant1 || null,
          custom_assistant_2: editForm.assistant2 || null,
          custom_assistant_3: editForm.assistant3 || null,
          custom_assistant_4: editForm.assistant4 || null,
          custom_assistant_5: editForm.assistant5 || null,
        },
      });
      invalidate({ resource: "Project", invalidates: ["detail"], id: name! });
      setEditStaffOpen(false);
    } catch (err: any) {
      setEditError(err?.message || "Failed to save changes");
    } finally {
      setIsSubmittingEdit(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/inquiry-api/wedding/${name}/delete`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Delete failed");
      }
      list("Project");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleStageChange(newStage: string) {
    await updateRecord({
      resource: "Project",
      id: name!,
      values: { custom_project_stage: newStage },
    });
    invalidate({ resource: "Project", invalidates: ["detail"], id: name! });
  }

  function toggleSharedWith(employeeId: string) {
    setSharedWith((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) {
        next.delete(employeeId);
      } else {
        next.add(employeeId);
      }
      return next;
    });
  }

  function resetTaskForm() {
    setTaskForm({
      subject: "",
      phase: "",
      deadline: "",
      priority: "Medium",
      assignee: "",
    });
    setSharedWith(new Set());
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskForm.subject.trim() || !taskForm.phase || !taskForm.deadline) return;

    setIsSubmittingTask(true);
    try {
      const assigneeEmployee = employees.find((e) => e.id === taskForm.assignee);
      const assigneeUserId = assigneeEmployee?.userId;

      const resp = await fetch("/inquiry-api/task/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: name,
          subject: taskForm.subject.trim(),
          phase: taskForm.phase,
          deadline: taskForm.deadline,
          priority: taskForm.priority || "Medium",
          shared_with: Array.from(sharedWith).join(","),
          assignee_user_id: assigneeUserId || null,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to create task");
      }

      setCreateTaskOpen(false);
      resetTaskForm();
      invalidate({ resource: "Task", invalidates: ["list"] });
    } finally {
      setIsSubmittingTask(false);
    }
  }

  async function handleAddMilestone(e: React.FormEvent) {
    e.preventDefault();
    if (!milestoneForm.amount) return;
    setIsSubmittingMilestone(true);
    setMilestoneError(null);
    try {
      const res = await fetch(`/inquiry-api/wedding/${name}/milestone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: parseFloat(milestoneForm.amount),
          label: milestoneForm.label,
          invoice_date: milestoneForm.invoiceDate,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to create milestone");
      }
      setAddMilestoneOpen(false);
      setMilestoneForm({ label: "", amount: "", invoiceDate: new Date().toISOString().slice(0, 10) });
      if (name) fetchInvoices(name);
    } catch (err) {
      setMilestoneError(err instanceof Error ? err.message : "Failed to create milestone");
    } finally {
      setIsSubmittingMilestone(false);
    }
  }

  async function handleOpenAllowanceDialog() {
    setAllowanceLoading(true);
    setAllowanceError(null);
    setAllowancePreview(null);
    setAllowanceSuccess(null);
    try {
      const res = await fetch(`/inquiry-api/generate-allowances/${encodeURIComponent(name!)}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Preview failed (${res.status})`);
      }
      const data = await res.json();
      setAllowancePreview(data);
      setAllowanceDialogOpen(true);
    } catch (err: any) {
      setAllowanceError(err?.message || "Failed to load preview");
      setAllowanceDialogOpen(true);
    } finally {
      setAllowanceLoading(false);
    }
  }

  async function handleConfirmAllowances() {
    setAllowanceSubmitting(true);
    setAllowanceError(null);
    try {
      const res = await fetch(`/inquiry-api/generate-allowances/${encodeURIComponent(name!)}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Generation failed (${res.status})`);
      }
      const data = await res.json();
      const count = data.created?.length ?? 0;
      setAllowanceSuccess(`${count} allowance record${count !== 1 ? "s" : ""} created successfully.`);
      setAllowancePreview(null);
    } catch (err: any) {
      setAllowanceError(err?.message || "Failed to generate allowances");
    } finally {
      setAllowanceSubmitting(false);
    }
  }

  function getAssigneeFromTask(task: any) {
    try {
      const assignedUsers = JSON.parse(task._assign || "[]");
      if (assignedUsers.length === 0) return null;
      const userId = assignedUsers[0];
      const employee = employees.find((e) => e.userId === userId);
      return employee?.name || userId;
    } catch {
      return null;
    }
  }

  function getSharedWithFromTask(task: any) {
    if (!task.custom_shared_with) return [];
    const ids = task.custom_shared_with.split(",").filter(Boolean);
    return ids
      .map((id: string) => {
        const employee = employees.find((e) => e.id === id.trim());
        return employee?.name || id;
      })
      .filter(Boolean);
  }

  if (!project) {
    return <DetailSkeleton />;
  }

  const weddingDate = project.expected_end_date || salesOrder?.delivery_date;
  const venueName = salesOrder?.custom_venue;
  const totalValue = salesOrder?.grand_total || 0;
  const customerName = customer?.customer_name || salesOrder?.customer_name || project.project_name;

  // Payment calculations
  const totalInvoiced = invoices.reduce(
    (sum: number, inv: any) => sum + (inv.grand_total || 0),
    0
  );
  const totalOutstanding = invoices.reduce(
    (sum: number, inv: any) => sum + (inv.outstanding_amount || 0),
    0
  );
  const totalPaid = totalInvoiced - totalOutstanding;
  const paidPct = totalValue > 0 ? Math.round((totalPaid / totalValue) * 100) : 0;

  // Team members
  const assistants = [
    project.custom_assistant_1,
    project.custom_assistant_2,
    project.custom_assistant_3,
    project.custom_assistant_4,
    project.custom_assistant_5,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      {/* Mobile Header */}
      <div className="lg:hidden">
        <div className="flex items-center gap-3 mb-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold tracking-tight truncate">
              {customerName}
            </h1>
          </div>
          <Badge variant={statusVariant(project.status)} className="shrink-0">
            {project.status}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mb-3">
          {weddingDate && (
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(weddingDate)}
            </span>
          )}
          {venueName && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {venueName}
            </span>
          )}
        </div>

      </div>

      {/* Desktop Header */}
      <div className="hidden lg:flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            {customerName}
          </h1>
          <Badge variant={statusVariant(project.status)}>{project.status}</Badge>
          <Badge variant={stageBadgeVariant(project.custom_project_stage || "Planning")}>
            {project.custom_project_stage || "Planning"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" /> Delete
          </Button>
        </div>
      </div>

      {/* Main Content - 3 Tabs */}
      <div className="min-w-0">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="w-full lg:w-auto">
              <TabsTrigger value="overview" className="flex-1 lg:flex-none">
                Overview
              </TabsTrigger>
              <TabsTrigger value="tasks" className="flex-1 lg:flex-none">
                Tasks
              </TabsTrigger>
              <TabsTrigger value="activity" className="flex-1 lg:flex-none">
                Activity
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="mt-4 space-y-4">
              {/* Wedding Details */}
              {(weddingDate || venueName || totalValue > 0 || addOnItems.length > 0) && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle>Wedding Details</CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { populateDetailsForm(); setEditDetailsOpen(true); }}
                    >
                      <Pencil className="h-3 w-3 mr-1" /> Edit
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {weddingDate && (
                      <div className="flex items-start gap-3 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">Date</p>
                          <p className="font-medium">{formatDate(weddingDate)}</p>
                        </div>
                      </div>
                    )}
                    {venueName && (
                      <div className="flex items-start gap-3 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">Venue</p>
                          <p className="font-medium">{venueName}</p>
                        </div>
                      </div>
                    )}
                    {totalValue > 0 && (
                      <div className="flex items-start gap-3 text-sm">
                        <DollarSign className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">Total Package</p>
                          <p className="font-medium">{formatVND(totalValue)}</p>
                        </div>
                      </div>
                    )}
                    {addOnItems.length > 0 && (
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground mb-2">Add-ons</p>
                        <div className="space-y-1">
                          {addOnItems.map((item) => (
                            <div key={item.name} className="flex justify-between text-sm">
                              <span>{item.item_name}</span>
                              <span className="text-muted-foreground">{formatVND(item.amount)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Payment Milestones */}
              <Card>
                <CardHeader>
                  <CardTitle>Payment Milestones</CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Progress Header */}
                  <div className="space-y-2 mb-6">
                    <div className="flex justify-between items-baseline">
                      <span className="text-2xl font-semibold" style={{ fontFamily: "Georgia, serif" }}>
                        {paidPct}%{" "}
                        <span className="text-sm font-normal text-muted-foreground">paid</span>
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {formatVND(totalPaid)} of {formatVND(totalValue)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(paidPct, 100)}%`, backgroundColor: "#C4A962" }}
                      />
                    </div>
                    {totalOutstanding > 0 && (
                      <p className="text-xs text-muted-foreground">{formatVND(totalOutstanding)} remaining</p>
                    )}
                  </div>

                  {/* Milestone timeline */}
                  {invoices.length > 0 ? (
                    <div className="relative">
                      {(invoices as any[]).map((inv, index) => {
                        const isPaid = inv.status === "Paid" || inv.outstanding_amount === 0;
                        const isOverdue = inv.status === "Overdue";
                        const pct = totalValue > 0 ? Math.round((inv.grand_total / totalValue) * 100) : 0;
                        const isLast = index === invoices.length - 1;
                        return (
                          <div key={inv.name} className="flex gap-3">
                            {/* Timeline dot + connector */}
                            <div className="flex flex-col items-center">
                              <div
                                className={cn(
                                  "w-3 h-3 rounded-full mt-0.5 shrink-0 border-2",
                                  isPaid
                                    ? "border-[#C4A962]"
                                    : isOverdue
                                    ? "bg-destructive border-destructive"
                                    : "bg-background border-muted-foreground/40"
                                )}
                                style={isPaid ? { backgroundColor: "#C4A962" } : undefined}
                              />
                              {!isLast && <div className="w-px flex-1 bg-border min-h-[24px]" />}
                            </div>
                            {/* Content */}
                            <div className="flex items-start justify-between pb-4 flex-1 min-w-0">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{inv.name}</p>
                                {inv.due_date && (
                                  <p className="text-xs text-muted-foreground">{formatDate(inv.due_date)}</p>
                                )}
                              </div>
                              <div className="flex items-start gap-2 shrink-0 ml-3">
                                <div className="text-right">
                                  <p className="text-sm font-medium">{formatVND(inv.grand_total)}</p>
                                  <p className="text-xs text-muted-foreground">{pct}%</p>
                                  <Badge
                                    variant={isPaid ? "success" : isOverdue ? "destructive" : "secondary"}
                                    className="text-[10px] mt-0.5"
                                  >
                                    {isPaid ? "Paid" : isOverdue ? "Overdue" : "Unpaid"}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No payment milestones yet.
                    </p>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => {
                      setMilestoneForm({
                        label: "",
                        amount: "",
                        invoiceDate: new Date().toISOString().slice(0, 10),
                      });
                      setMilestoneError(null);
                      setAddMilestoneOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Add Payment Milestone
                  </Button>
                </CardContent>
              </Card>

              {/* Team */}
              {(project.custom_lead_planner || project.custom_support_planner || assistants.length > 0) && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle>Team</CardTitle>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleOpenAllowanceDialog}
                        disabled={allowanceLoading}
                      >
                        {allowanceLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        Generate Allowances
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { populateStaffForm(); setEditStaffOpen(true); }}
                      >
                        <Pencil className="h-3 w-3 mr-1" /> Edit
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {allowanceSuccess && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm mb-2">
                        <Check className="h-4 w-4 shrink-0" />
                        {allowanceSuccess}
                      </div>
                    )}
                    {project.custom_lead_planner && (
                      <ReadOnlyField
                        label="Lead Planner"
                        value={getEmployeeNameById(project.custom_lead_planner) || project.custom_lead_planner}
                      />
                    )}
                    {project.custom_support_planner && (
                      <ReadOnlyField
                        label="Support Planner"
                        value={getEmployeeNameById(project.custom_support_planner) || project.custom_support_planner}
                      />
                    )}
                    {assistants.map((asst: any, i) => (
                      <ReadOnlyField
                        key={i}
                        label={`Assistant ${i + 1}`}
                        value={getEmployeeNameById(asst) || asst}
                      />
                    ))}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Tasks Tab */}
            <TabsContent value="tasks" className="mt-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Project Tasks
                  </CardTitle>
                  <Button size="sm" onClick={() => setCreateTaskOpen(true)}>
                    <Plus className="h-4 w-4 mr-1.5" />
                    Add Task
                  </Button>
                  <Sheet open={createTaskOpen} onOpenChange={setCreateTaskOpen}>
                    <SheetContent side="right" className="sm:max-w-lg flex flex-col p-0">
                      <SheetHeader className="px-6 py-4 border-b shrink-0">
                        <SheetTitle>Create Task</SheetTitle>
                      </SheetHeader>
                      <form onSubmit={handleCreateTask} className="flex flex-col flex-1 overflow-hidden">
                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="task-subject">Subject *</Label>
                            <Input
                              id="task-subject"
                              placeholder="e.g. Send vendor contracts"
                              value={taskForm.subject}
                              onChange={(e) =>
                                setTaskForm({ ...taskForm, subject: e.target.value })
                              }
                              required
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="task-phase">Phase *</Label>
                              <Select
                                value={taskForm.phase}
                                onValueChange={(value) =>
                                  setTaskForm({ ...taskForm, phase: value })
                                }
                                required
                              >
                                <SelectTrigger id="task-phase">
                                  <SelectValue placeholder="Select phase" />
                                </SelectTrigger>
                                <SelectContent>
                                  {WEDDING_PHASES.map((phase) => (
                                    <SelectItem key={phase} value={phase}>
                                      {phase}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="task-deadline">Deadline *</Label>
                              <Input
                                id="task-deadline"
                                type="date"
                                value={taskForm.deadline}
                                onChange={(e) =>
                                  setTaskForm({ ...taskForm, deadline: e.target.value })
                                }
                                required
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="task-assignee">Assign To</Label>
                              <Select
                                value={taskForm.assignee}
                                onValueChange={(value) =>
                                  setTaskForm({ ...taskForm, assignee: value })
                                }
                              >
                                <SelectTrigger id="task-assignee">
                                  <SelectValue placeholder="Select employee" />
                                </SelectTrigger>
                                <SelectContent>
                                  {employees.map((emp) => (
                                    <SelectItem key={emp.id} value={emp.id}>
                                      {emp.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="task-priority">Priority</Label>
                              <Select
                                value={taskForm.priority}
                                onValueChange={(value) =>
                                  setTaskForm({ ...taskForm, priority: value })
                                }
                              >
                                <SelectTrigger id="task-priority">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {PRIORITY_OPTIONS.map((priority) => (
                                    <SelectItem key={priority} value={priority}>
                                      {priority}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Share With</Label>
                            <Popover.Root>
                              <Popover.Trigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="w-full justify-start"
                                >
                                  {sharedWith.size > 0
                                    ? `${sharedWith.size} employee(s) selected`
                                    : "Select employees to share with..."}
                                </Button>
                              </Popover.Trigger>
                              <Popover.Portal>
                                <Popover.Content
                                  className="z-50 w-[260px] max-h-[300px] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
                                  align="start"
                                  sideOffset={4}
                                >
                                  {employees
                                    .filter((emp) => emp.id !== taskForm.assignee)
                                    .map((emp) => {
                                      const isSelected = sharedWith.has(emp.id);
                                      return (
                                        <button
                                          type="button"
                                          key={emp.id}
                                          onClick={() => toggleSharedWith(emp.id)}
                                          className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                                        >
                                          <div
                                            className={cn(
                                              "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                              isSelected
                                                ? "bg-primary text-primary-foreground"
                                                : "opacity-50"
                                            )}
                                          >
                                            {isSelected && <Check className="h-4 w-4" />}
                                          </div>
                                          <span>{emp.name}</span>
                                        </button>
                                      );
                                    })}
                                  {sharedWith.size > 0 && (
                                    <>
                                      <div className="-mx-1 my-1 h-px bg-muted" />
                                      <button
                                        type="button"
                                        onClick={() => setSharedWith(new Set())}
                                        className="flex w-full cursor-default select-none items-center justify-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                                      >
                                        Clear all
                                      </button>
                                    </>
                                  )}
                                </Popover.Content>
                              </Popover.Portal>
                            </Popover.Root>
                            <p className="text-xs text-muted-foreground">
                              Additional employees who can see this task
                            </p>
                          </div>
                        </div>
                        <SheetFooter className="px-6 py-4 border-t shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setCreateTaskOpen(false);
                              resetTaskForm();
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            disabled={
                              isSubmittingTask ||
                              !taskForm.subject.trim() ||
                              !taskForm.phase ||
                              !taskForm.deadline
                            }
                          >
                            {isSubmittingTask ? "Creating..." : "Create Task"}
                          </Button>
                        </SheetFooter>
                      </form>
                    </SheetContent>
                  </Sheet>
                </CardHeader>
                <CardContent>
                  {tasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No tasks yet. Click "Add Task" to create your first task.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {tasks.map((task: any) => {
                        const assignee = getAssigneeFromTask(task);
                        const sharedWithNames = getSharedWithFromTask(task);
                        return (
                          <div
                            key={task.name}
                            className="flex items-start justify-between p-3 rounded-lg border bg-muted/30 gap-3"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {task.subject}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                {task.exp_end_date && (
                                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                    <Clock className="h-3 w-3" />
                                    {formatDate(task.exp_end_date)}
                                  </span>
                                )}
                                {assignee && (
                                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                    <User className="h-3 w-3" />
                                    {assignee}
                                  </span>
                                )}
                                {sharedWithNames.length > 0 && (
                                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                    <Users className="h-3 w-3" />
                                    +{sharedWithNames.length} shared
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                              {task.custom_wedding_phase && (
                                <Badge
                                  variant={stageBadgeVariant(task.custom_wedding_phase)}
                                  className="text-[10px]"
                                >
                                  {task.custom_wedding_phase}
                                </Badge>
                              )}
                              {task.priority && (
                                <Badge
                                  variant={
                                    task.priority === "High" ||
                                    task.priority === "Urgent"
                                      ? "destructive"
                                      : task.priority === "Medium"
                                      ? "warning"
                                      : "secondary"
                                  }
                                  className="text-[10px]"
                                >
                                  {task.priority}
                                </Badge>
                              )}
                              <Badge
                                variant={
                                  task.status === "Completed"
                                    ? "success"
                                    : task.status === "Cancelled"
                                    ? "destructive"
                                    : "secondary"
                                }
                                className="text-[10px]"
                              >
                                {task.status}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Activity Tab */}
            <TabsContent value="activity" className="mt-4">
              <InternalNotesSection
                references={[{ doctype: "Project", docName: name! }]}
              />
            </TabsContent>
          </Tabs>
      </div>

      {/* Add Payment Milestone Sheet */}
      <Sheet open={addMilestoneOpen} onOpenChange={setAddMilestoneOpen}>
        <SheetContent side="right" className="sm:max-w-md flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle>Add Payment Milestone</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleAddMilestone} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {milestoneError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {milestoneError}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="milestone-label">Label</Label>
                <Input
                  id="milestone-label"
                  placeholder="e.g. Deposit, Second Payment"
                  value={milestoneForm.label}
                  onChange={(e) => setMilestoneForm({ ...milestoneForm, label: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="milestone-amount">Amount (VND) *</Label>
                <div className="flex gap-1.5">
                  {[25, 30, 50, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                      onClick={() => setMilestoneForm({ ...milestoneForm, amount: String(Math.round(totalValue * pct / 100)) })}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
                <Input
                  id="milestone-amount"
                  type="number"
                  placeholder="25000000"
                  value={milestoneForm.amount}
                  onChange={(e) => setMilestoneForm({ ...milestoneForm, amount: e.target.value })}
                  required
                />
                {milestoneForm.amount && totalValue > 0 && (
                  <p className="text-xs text-muted-foreground">
                    = {Math.round((parseFloat(milestoneForm.amount) / totalValue) * 100)}% of total
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Remaining: {formatVND(Math.max(0, totalValue - totalInvoiced))}
                </p>
                {milestoneForm.amount &&
                  totalValue > 0 &&
                  parseFloat(milestoneForm.amount) > totalValue - totalInvoiced && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Amount exceeds remaining unbilled ({formatVND(Math.max(0, totalValue - totalInvoiced))})
                    </p>
                  )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="milestone-invoice-date">Payment Date</Label>
                <Input
                  id="milestone-invoice-date"
                  type="date"
                  value={milestoneForm.invoiceDate}
                  onChange={(e) => setMilestoneForm({ ...milestoneForm, invoiceDate: e.target.value })}
                />
              </div>
            </div>
            <SheetFooter className="px-6 py-4 border-t shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddMilestoneOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmittingMilestone || !milestoneForm.amount}
              >
                {isSubmittingMilestone ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Milestone"
                )}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Edit Wedding Details Sheet (Venue + Add-ons) */}
      <Sheet open={editDetailsOpen} onOpenChange={(open) => { if (!isSubmittingEdit) { setEditDetailsOpen(open); setEditError(null); } }}>
        <SheetContent side="right" className="sm:max-w-lg flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle>Edit Wedding Details</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSaveDetails} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
              {editError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {editError}
                </div>
              )}

              {/* Venue */}
              <div className="space-y-2">
                <Label>Venue</Label>
                <ShadcnPopover open={editVenueOpen} onOpenChange={setEditVenueOpen}>
                  <ShadcnPopoverTrigger asChild>
                    <button
                      type="button"
                      role="combobox"
                      className="w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors border-input bg-background hover:border-primary/50 focus:outline-none"
                    >
                      {editVenueDisplayName || editForm.venue || <span className="text-muted-foreground">Select venue...</span>}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </button>
                  </ShadcnPopoverTrigger>
                  <ShadcnPopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search venues..."
                        value={editVenueSearch}
                        onValueChange={setEditVenueSearch}
                      />
                      <CommandList>
                        <CommandEmpty>No venues found.</CommandEmpty>
                        <CommandGroup>
                          {venues.map((v) => (
                            <CommandItem
                              key={v.name}
                              value={v.supplier_name}
                              onSelect={() => {
                                setEditForm({ ...editForm, venue: v.name });
                                setEditVenueDisplayName(v.supplier_name);
                                setEditVenueOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", editForm.venue === v.name ? "opacity-100" : "opacity-0")} />
                              {v.supplier_name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </ShadcnPopoverContent>
                </ShadcnPopover>
              </div>

              {/* Add-ons */}
              <div className="space-y-2">
                <Label>Add-ons</Label>
                {editForm.addOns.map((addon, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="Add-on name..."
                        value={editAddonSearch[i] ?? addon.itemName}
                        onChange={(e) => {
                          const newSearch = [...editAddonSearch];
                          newSearch[i] = e.target.value;
                          setEditAddonSearch(newSearch);
                          const updated = editForm.addOns.map((a, j) =>
                            j === i ? { ...a, itemCode: "", itemName: e.target.value } : a
                          );
                          setEditForm({ ...editForm, addOns: updated });
                        }}
                        onFocus={() => {
                          const newOpen = [...editAddonDropdownOpen];
                          newOpen[i] = true;
                          setEditAddonDropdownOpen(newOpen);
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            const newOpen = [...editAddonDropdownOpen];
                            newOpen[i] = false;
                            setEditAddonDropdownOpen(newOpen);
                          }, 200);
                        }}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      {editAddonDropdownOpen[i] && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                          {availableAddOns
                            .filter((item) => !editAddonSearch[i] || item.item_name.toLowerCase().includes((editAddonSearch[i] ?? "").toLowerCase()))
                            .map((item) => (
                              <div
                                key={item.name}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  const newSearch = [...editAddonSearch];
                                  newSearch[i] = item.item_name;
                                  setEditAddonSearch(newSearch);
                                  const updated = editForm.addOns.map((a, j) =>
                                    j === i ? {
                                      ...a,
                                      itemCode: item.name,
                                      itemName: item.item_name,
                                      includeInCommission: !!(item as any).custom_include_in_commission,
                                    } : a
                                  );
                                  setEditForm({ ...editForm, addOns: updated });
                                  const newOpen = [...editAddonDropdownOpen];
                                  newOpen[i] = false;
                                  setEditAddonDropdownOpen(newOpen);
                                }}
                                className="px-3 py-2 text-sm cursor-pointer hover:bg-muted flex items-center gap-2"
                              >
                                {item.name === addon.itemCode && <Check className="h-3 w-3" />}
                                {item.item_name}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                    <input
                      type="number"
                      placeholder="Rate (VND)"
                      value={addon.rate || ""}
                      onChange={(e) => {
                        const updated = editForm.addOns.map((a, j) =>
                          j === i ? { ...a, rate: parseFloat(e.target.value) || 0 } : a
                        );
                        setEditForm({ ...editForm, addOns: updated });
                      }}
                      className="w-28 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <label className="flex items-center gap-1.5 py-2 text-sm text-muted-foreground whitespace-nowrap cursor-pointer">
                      <input
                        type="checkbox"
                        checked={addon.includeInCommission}
                        onChange={(e) => {
                          const updated = editForm.addOns.map((a, j) =>
                            j === i ? { ...a, includeInCommission: e.target.checked } : a
                          );
                          setEditForm({ ...editForm, addOns: updated });
                        }}
                        className="accent-[#C4A962]"
                      />
                      Commission
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => {
                        setEditForm({ ...editForm, addOns: editForm.addOns.filter((_, j) => j !== i) });
                        setEditAddonSearch((prev) => prev.filter((_, j) => j !== i));
                        setEditAddonDropdownOpen((prev) => prev.filter((_, j) => j !== i));
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setEditForm({ ...editForm, addOns: [...editForm.addOns, { itemCode: "", itemName: "", qty: 1, rate: 0, includeInCommission: false }] });
                    setEditAddonSearch((prev) => [...prev, ""]);
                    setEditAddonDropdownOpen((prev) => [...prev, false]);
                  }}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors pt-1"
                >
                  <Plus className="h-4 w-4" />
                  Add item
                </button>
              </div>
            </div>
            <SheetFooter className="px-6 py-4 border-t shrink-0">
              <Button type="button" variant="outline" onClick={() => setEditDetailsOpen(false)} disabled={isSubmittingEdit}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmittingEdit}>
                {isSubmittingEdit ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Edit Team Sheet (Staff) */}
      <Sheet open={editStaffOpen} onOpenChange={(open) => { if (!isSubmittingEdit) { setEditStaffOpen(open); setEditError(null); } }}>
        <SheetContent side="right" className="sm:max-w-lg flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle>Edit Team</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSaveStaff} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
              {editError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {editError}
                </div>
              )}

              {/* Staff */}
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Lead Planner</Label>
                    <Select value={editForm.leadPlanner || "__none__"} onValueChange={(v) => setEditForm({ ...editForm, leadPlanner: v === "__none__" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {employees.map((emp) => (
                          <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Support Planner</Label>
                    <Select value={editForm.supportPlanner || "__none__"} onValueChange={(v) => setEditForm({ ...editForm, supportPlanner: v === "__none__" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {employees.map((emp) => (
                          <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {(["assistant1", "assistant2", "assistant3", "assistant4", "assistant5"] as const).map((field, i) => (
                    <div key={field} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Assistant {i + 1}</Label>
                      <Select value={editForm[field] || "__none__"} onValueChange={(v) => setEditForm({ ...editForm, [field]: v === "__none__" ? "" : v })}>
                        <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {employees.map((emp) => (
                            <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <SheetFooter className="px-6 py-4 border-t shrink-0">
              <Button type="button" variant="outline" onClick={() => setEditStaffOpen(false)} disabled={isSubmittingEdit}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmittingEdit}>
                {isSubmittingEdit ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Generate Allowances Dialog */}
      <Dialog open={allowanceDialogOpen} onOpenChange={(open) => { if (!allowanceSubmitting) { setAllowanceDialogOpen(open); if (!open) { setAllowancePreview(null); setAllowanceError(null); setAllowanceSuccess(null); } } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Wedding Allowances</DialogTitle>
            <p className="text-sm text-muted-foreground">{customerName}</p>
          </DialogHeader>
          <div className="space-y-4">
            {allowanceError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {allowanceError}
              </div>
            )}
            {allowanceSuccess && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm">
                <Check className="h-4 w-4 shrink-0" />
                {allowanceSuccess}
              </div>
            )}
            {allowancePreview && !allowanceSuccess && (
              <>
                {allowancePreview.created.length > 0 ? (
                  <div>
                    <p className="text-sm font-medium mb-2">Employees to receive allowance:</p>
                    <div className="space-y-1.5">
                      {allowancePreview.created.map((item: any, i: number) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span>{item.employee_name || item.employee}</span>
                          <span className="font-medium">{formatVND(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No employees are eligible for an allowance on this project.</p>
                )}
                {allowancePreview.skipped.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {allowancePreview.skipped.length} employee{allowancePreview.skipped.length !== 1 ? "s have" : " has"} no rate configured and will be skipped.
                  </p>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAllowanceDialogOpen(false)} disabled={allowanceSubmitting}>
              {allowanceSuccess ? "Close" : "Cancel"}
            </Button>
            {!allowanceSuccess && allowancePreview && allowancePreview.created.length > 0 && (
              <Button onClick={handleConfirmAllowances} disabled={allowanceSubmitting}>
                {allowanceSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</> : "Generate"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Project Sheet - kept at root level to avoid remount flashing */}
      <Sheet open={deleteOpen} onOpenChange={(open) => { if (!isDeleting) { setDeleteOpen(open); setDeleteError(null); } }}>
        <SheetContent side="right" className="sm:max-w-sm flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle>Delete Project</SheetTitle>
          </SheetHeader>
          <div className="px-6 py-4 space-y-3">
            <p className="text-sm text-muted-foreground">Are you sure you want to delete this project? This action cannot be undone.</p>
            {deleteError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {deleteError}
              </div>
            )}
          </div>
          <SheetFooter className="px-6 py-4 border-t shrink-0">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</> : "Delete"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
