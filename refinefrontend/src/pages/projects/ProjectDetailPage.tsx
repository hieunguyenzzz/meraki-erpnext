import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useOne, useList, useDelete, useUpdate, useInvalidate, useNavigation, useCreate, useApiUrl } from "@refinedev/core";
import * as Popover from "@radix-ui/react-popover";
import { formatDate, formatVND } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
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
  ChevronDown,
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  DollarSign,
  Plus,
  Check,
  User,
  Clock,
} from "lucide-react";
import { DetailSkeleton } from "@/components/detail-skeleton";
import { ReadOnlyField } from "@/components/crm/ReadOnlyField";
import { InternalNotesSection } from "@/components/crm/ActivitySection";
import { cn } from "@/lib/utils";
import { PROJECT_COLUMNS } from "@/lib/projectKanban";

const STAGE_OPTIONS = PROJECT_COLUMNS.map((col) => col.stages[0]);

const SITE_NAME = "erp.merakiwp.com";

const WEDDING_PHASES = [
  "Onboarding",
  "Planning",
  "Final Details",
  "Wedding Week",
  "Day-of",
  "Completed",
];

const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Urgent"];

function phaseBadgeVariant(phase: string) {
  switch (phase) {
    case "Onboarding":
      return "info" as const;
    case "Planning":
      return "warning" as const;
    case "Final Details":
      return "info" as const;
    case "Wedding Week":
      return "destructive" as const;
    case "Day-of":
      return "secondary" as const;
    case "Completed":
      return "success" as const;
    default:
      return "secondary" as const;
  }
}

function statusVariant(status: string) {
  switch (status) {
    case "Open":
      return "warning" as const;
    case "Completed":
      return "success" as const;
    case "Cancelled":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}

function stageBadgeVariant(stage: string) {
  switch (stage) {
    case "Onboarding":
      return "info" as const;
    case "Planning":
      return "warning" as const;
    case "Final Details":
      return "info" as const;
    case "Wedding Week":
      return "destructive" as const;
    case "Day-of":
      return "secondary" as const;
    case "Completed":
      return "success" as const;
    default:
      return "secondary" as const;
  }
}

export default function ProjectDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [mobileInfoOpen, setMobileInfoOpen] = useState(false);
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

  const invalidate = useInvalidate();
  const { mutateAsync: deleteRecord } = useDelete();
  const { mutateAsync: updateRecord } = useUpdate();
  const { mutateAsync: createDoc } = useCreate();
  const { list } = useNavigation();
  const apiUrl = useApiUrl();

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

  // Fetch Sales Order items (add-ons)
  const { result: soItemsResult } = useList({
    resource: "Sales Order Item",
    pagination: { mode: "off" as const },
    filters: [{ field: "parent", operator: "eq", value: project?.sales_order! }],
    meta: { fields: ["name", "item_code", "item_name", "qty", "rate", "amount"] },
    queryOptions: { enabled: !!project?.sales_order },
  });
  const soItems = (soItemsResult?.data ?? []) as { name: string; item_code: string; item_name: string; qty: number; rate: number; amount: number }[];
  const addOnItems = soItems.filter((i) => i.item_code !== "Wedding Planning Service");

  // Fetch Sales Invoices linked to Sales Order
  const { result: invoicesResult } = useList({
    resource: "Sales Invoice",
    pagination: { mode: "off" as const },
    filters: [
      {
        field: "sales_order",
        operator: "contains",
        value: project?.sales_order!,
      },
    ],
    meta: {
      fields: ["name", "grand_total", "outstanding_amount", "status"],
    },
    queryOptions: { enabled: !!project?.sales_order },
  });
  const invoices = invoicesResult?.data ?? [];

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

  // Fetch Employees for task assignment
  const { result: employeesResult } = useList({
    resource: "Employee",
    pagination: { mode: "off" as const },
    filters: [{ field: "status", operator: "eq", value: "Active" }],
    meta: { fields: ["name", "employee_name", "user_id"] },
  });
  const employees = (employeesResult?.data ?? []).map((e: any) => ({
    id: e.name,
    name: e.employee_name,
    userId: e.user_id,
  }));

  async function handleDelete() {
    const soName = project?.sales_order;

    if (soName) {
      // 1. Find linked Sales Invoices
      const invRes = await fetch(
        `${apiUrl}/resource/Sales Invoice` +
        `?filters=${encodeURIComponent(JSON.stringify([["sales_order", "=", soName]]))}` +
        `&fields=${encodeURIComponent(JSON.stringify(["name", "docstatus"]))}`,
        { credentials: "include" }
      );
      const invData = await invRes.json();

      // Cancel submitted invoices then delete via Refine (handles CSRF)
      for (const inv of (invData.data ?? [])) {
        if (inv.docstatus === 1) {
          await fetch("/api/method/frappe.client.cancel", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Frappe-Site-Name": SITE_NAME },
            credentials: "include",
            body: JSON.stringify({ doctype: "Sales Invoice", name: inv.name }),
          });
        }
        await deleteRecord({ resource: "Sales Invoice", id: inv.name });
      }

      // 2. Cancel and delete the Sales Order via Refine
      await fetch("/api/method/frappe.client.cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Frappe-Site-Name": SITE_NAME },
        credentials: "include",
        body: JSON.stringify({ doctype: "Sales Order", name: soName }),
      });
      await deleteRecord({ resource: "Sales Order", id: soName });
    }

    // 3. Delete Project (no docstatus, direct delete)
    await deleteRecord({ resource: "Project", id: name! });
    list("Project");
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
      // Get user_id for the assignee
      const assigneeEmployee = employees.find((e) => e.id === taskForm.assignee);
      const assigneeUserId = assigneeEmployee?.userId;

      // Create the task first
      const result = await createDoc({
        resource: "Task",
        values: {
          subject: taskForm.subject.trim(),
          project: name,
          custom_wedding_phase: taskForm.phase,
          exp_end_date: taskForm.deadline,
          priority: taskForm.priority || "Medium",
          custom_shared_with: Array.from(sharedWith).join(","),
          status: "Open",
        },
      });

      // If assignee selected, use ERPNext's assignment API
      if (assigneeUserId && result?.data?.name) {
        await fetch("/api/method/frappe.desk.form.assign_to.add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            doctype: "Task",
            name: result.data.name,
            assign_to: [assigneeUserId],
          }),
        });
      }

      setCreateTaskOpen(false);
      resetTaskForm();
      invalidate({ resource: "Task", invalidates: ["list"] });
    } finally {
      setIsSubmittingTask(false);
    }
  }

  // Helper to get employee name from task's _assign field
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

  // Helper to get shared with employee names
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
  const totalValue = salesOrder?.grand_total;
  const customerName = customer?.customer_name || salesOrder?.customer_name || project.project_name;

  // Calculate payments summary
  // If no invoices exist (manually created wedding), the full amount is treated as paid
  const totalInvoiced = invoices.reduce(
    (sum: number, inv: any) => sum + (inv.grand_total || 0),
    0
  );
  const totalOutstanding = invoices.reduce(
    (sum: number, inv: any) => sum + (inv.outstanding_amount || 0),
    0
  );
  const totalPaid = invoices.length > 0 ? totalInvoiced - totalOutstanding : (totalValue || 0);

  // Sidebar content
  const SidebarContent = () => (
    <div className="space-y-6">
      {/* Wedding Info */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Wedding</h3>
        <div className="space-y-2">
          {weddingDate && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{formatDate(weddingDate)}</span>
            </div>
          )}
          {venueName && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{venueName}</span>
            </div>
          )}
          {totalValue && (
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span>{formatVND(totalValue)}</span>
            </div>
          )}
          {addOnItems.length > 0 && (
            <div className="pl-6 space-y-1">
              {addOnItems.map((item) => (
                <div key={item.name} className="flex justify-between text-xs text-muted-foreground">
                  <span>{item.item_name}</span>
                  <span>{formatVND(item.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stage Selector */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Stage
        </h3>
        <Select
          value={project.custom_project_stage || "Planning"}
          onValueChange={handleStageChange}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STAGE_OPTIONS.map((stage) => (
              <SelectItem key={stage} value={stage}>
                {stage}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Customer */}
      {customer && (
        <div className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Customer
          </h3>
          <div className="space-y-2">
            <ReadOnlyField label="Name" value={customerName} />
            {customer.mobile_no && (
              <ReadOnlyField label="Phone" value={customer.mobile_no} />
            )}
            {customer.email_id && (
              <ReadOnlyField label="Email" value={customer.email_id} />
            )}
          </div>
        </div>
      )}

      {/* Payment Summary */}
      {totalValue && (
        <div className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Payments
          </h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-medium">{formatVND(totalValue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paid</span>
              <span className="text-green-600">{formatVND(totalPaid)}</span>
            </div>
            {invoices.length > 0 && totalOutstanding > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Outstanding</span>
                <span className="text-amber-600">{formatVND(totalOutstanding)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2 pt-2 border-t">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="h-4 w-4 mr-2" /> Delete Project
        </Button>
        <Sheet open={deleteOpen} onOpenChange={setDeleteOpen}>
          <SheetContent side="right" className="sm:max-w-sm flex flex-col p-0">
            <SheetHeader className="px-6 py-4 border-b shrink-0">
              <SheetTitle>Delete Project</SheetTitle>
            </SheetHeader>
            <div className="px-6 py-4">
              <p className="text-sm text-muted-foreground">Are you sure you want to delete this project? This action cannot be undone.</p>
            </div>
            <SheetFooter className="px-6 py-4 border-t shrink-0">
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete}>
                Delete
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>

    </div>
  );

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
        </div>

        {/* Mobile info summary */}
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

        {/* Collapsible details */}
        <Collapsible open={mobileInfoOpen} onOpenChange={setMobileInfoOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-between mb-4"
            >
              {mobileInfoOpen ? "Hide details" : "Show all details"}
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  mobileInfoOpen && "rotate-180"
                )}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="mb-4">
              <CardContent className="pt-4">
                <SidebarContent />
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Desktop Header */}
      <div className="hidden lg:flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {customerName}
          </h1>
          <Badge variant={statusVariant(project.status)}>{project.status}</Badge>
          <Badge variant={stageBadgeVariant(project.custom_project_stage || "Planning")}>
            {project.custom_project_stage || "Planning"}
          </Badge>
        </div>
      </div>

      {/* Two-column layout (desktop) */}
      <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-6">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block">
          <div className="sticky top-4">
            <Card>
              <CardContent className="pt-4">
                <SidebarContent />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Main Content - Tabs */}
        <div className="min-w-0">
          <Tabs defaultValue="tasks" className="w-full">
            <TabsList className="w-full lg:w-auto">
              <TabsTrigger value="tasks" className="flex-1 lg:flex-none">
                Tasks
              </TabsTrigger>
              <TabsTrigger value="activity" className="flex-1 lg:flex-none">
                Activity
              </TabsTrigger>
            </TabsList>

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
                                  variant={phaseBadgeVariant(task.custom_wedding_phase)}
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

            <TabsContent value="activity" className="mt-4">
              <InternalNotesSection
                references={[{ doctype: "Project", docName: name! }]}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
