import { useState, useEffect, useCallback } from "react";
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
  AlertCircle,
  Loader2,
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

  // Payment milestone state
  const [addMilestoneOpen, setAddMilestoneOpen] = useState(false);
  const [isSubmittingMilestone, setIsSubmittingMilestone] = useState(false);
  const [milestoneError, setMilestoneError] = useState<string | null>(null);
  const [milestoneForm, setMilestoneForm] = useState({
    label: "",
    amount: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
  });

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
    meta: { fields: ["name", "employee_name", "user_id"] },
  });
  const employees = (employeesResult?.data ?? []).map((e: any) => ({
    id: e.name,
    name: e.employee_name,
    userId: e.user_id,
  }));

  function getEmployeeNameById(id: string | null | undefined): string | null {
    if (!id) return null;
    const emp = employees.find((e) => e.id === id);
    return emp?.name || id;
  }

  async function handleDelete() {
    const soName = project?.sales_order;

    if (soName) {
      // 1. Find linked Sales Invoices (linked via `project` field)
      const invRes = await fetch(
        `${apiUrl}/resource/Sales Invoice` +
        `?filters=${encodeURIComponent(JSON.stringify([["project", "=", name]]))}` +
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
      const assigneeEmployee = employees.find((e) => e.id === taskForm.assignee);
      const assigneeUserId = assigneeEmployee?.userId;

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

  async function handleAddMilestone(e: React.FormEvent) {
    e.preventDefault();
    if (!milestoneForm.amount) return;
    setIsSubmittingMilestone(true);
    setMilestoneError(null);
    try {
      const amount = parseFloat(milestoneForm.amount);
      const itemName = milestoneForm.label
        ? `${milestoneForm.label} — Wedding Planning Service`
        : "Wedding Planning Service";

      const result = await createDoc({
        resource: "Sales Invoice",
        values: {
          customer: project?.customer,
          company: "Meraki Wedding Planner",
          set_posting_time: 1,
          posting_date: milestoneForm.invoiceDate,
          due_date: milestoneForm.invoiceDate,
          currency: "VND",
          selling_price_list: "Standard Selling VND",
          project: name,
          items: [{
            item_code: "Wedding Planning Service",
            item_name: itemName,
            qty: 1,
            rate: amount,
          }],
        },
      });

      const invoiceName = result?.data?.name;
      if (invoiceName) {
        const fullInvRes = await fetch(
          `/api/resource/Sales Invoice/${encodeURIComponent(invoiceName)}`,
          { headers: { "X-Frappe-Site-Name": SITE_NAME }, credentials: "include" }
        );
        const fullInvData = await fullInvRes.json();
        await fetch("/api/method/frappe.client.submit", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Frappe-Site-Name": SITE_NAME },
          credentials: "include",
          body: JSON.stringify({ doc: fullInvData.data }),
        });
      }

      setAddMilestoneOpen(false);
      setMilestoneForm({
        label: "",
        amount: "",
        invoiceDate: new Date().toISOString().slice(0, 10),
      });
      if (name) fetchInvoices(name);
    } catch (err) {
      setMilestoneError(err instanceof Error ? err.message : "Failed to create milestone");
    } finally {
      setIsSubmittingMilestone(false);
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

  const SidebarContent = () => (
    <div className="space-y-6">
      {/* Wedding Info */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Wedding</h3>
        <div className="space-y-2">
          {weddingDate && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-medium">{formatDate(weddingDate)}</span>
            </div>
          )}
          {venueName && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate">{venueName}</span>
            </div>
          )}
          {totalValue > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>{formatVND(totalValue)}</span>
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

      {/* Mini Payment Progress */}
      {totalValue > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Payment</h3>
            <span className="text-xs font-medium" style={{ color: "#C4A962" }}>{paidPct}% paid</span>
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
      )}

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
                              <div className="text-right shrink-0 ml-3">
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

              {/* Wedding Details */}
              {(weddingDate || venueName || totalValue > 0 || addOnItems.length > 0) && (
                <Card>
                  <CardHeader>
                    <CardTitle>Wedding Details</CardTitle>
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

              {/* Team */}
              {(project.custom_lead_planner || project.custom_support_planner || assistants.length > 0) && (
                <Card>
                  <CardHeader>
                    <CardTitle>Team</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
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

            {/* Activity Tab */}
            <TabsContent value="activity" className="mt-4">
              <InternalNotesSection
                references={[{ doctype: "Project", docName: name! }]}
              />
            </TabsContent>
          </Tabs>
        </div>
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
    </div>
  );
}
