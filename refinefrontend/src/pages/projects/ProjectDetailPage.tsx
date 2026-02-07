import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useOne, useList, useDelete, useUpdate, useInvalidate, useNavigation } from "@refinedev/core";
import { formatDate, formatVND } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
  FileText,
  ExternalLink,
} from "lucide-react";
import { DetailSkeleton } from "@/components/detail-skeleton";
import { ReadOnlyField } from "@/components/crm/ReadOnlyField";
import { InternalNotesSection } from "@/components/crm/ActivitySection";
import { cn } from "@/lib/utils";
import { PROJECT_COLUMNS } from "@/lib/projectKanban";

const STAGE_OPTIONS = PROJECT_COLUMNS.map((col) => col.stages[0]);

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

  const invalidate = useInvalidate();
  const { mutateAsync: deleteRecord } = useDelete();
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
      fields: ["name", "subject", "status", "priority", "exp_end_date"],
    },
    queryOptions: { enabled: !!name },
  });
  const tasks = tasksResult?.data ?? [];

  async function handleDelete() {
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

  if (!project) {
    return <DetailSkeleton />;
  }

  const weddingDate = project.expected_end_date || salesOrder?.delivery_date;
  const venueName = salesOrder?.custom_venue;
  const totalValue = salesOrder?.grand_total;
  const customerName = customer?.customer_name || salesOrder?.customer_name || project.project_name;

  // Calculate payments summary
  const totalInvoiced = invoices.reduce(
    (sum: number, inv: any) => sum + (inv.grand_total || 0),
    0
  );
  const totalOutstanding = invoices.reduce(
    (sum: number, inv: any) => sum + (inv.outstanding_amount || 0),
    0
  );
  const totalPaid = totalInvoiced - totalOutstanding;

  // Sidebar content
  const SidebarContent = () => (
    <div className="space-y-6">
      {/* Wedding Info */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Wedding
        </h3>
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

      {/* Linked Documents */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Linked Docs
        </h3>
        <div className="space-y-2">
          {project.sales_order && (
            <a
              href={`/app/sales-order/${project.sales_order}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <FileText className="h-4 w-4" />
              Sales Order
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {invoices.length > 0 && (
            <div className="text-sm">
              <span className="text-muted-foreground">
                {invoices.length} Invoice(s)
              </span>
            </div>
          )}
        </div>
      </div>

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
            <div className="flex justify-between">
              <span className="text-muted-foreground">Outstanding</span>
              <span className={totalOutstanding > 0 ? "text-amber-600" : ""}>
                {formatVND(totalOutstanding)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Meta */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Meta
        </h3>
        <div className="space-y-2">
          <ReadOnlyField label="Project ID" value={project.name} />
          <ReadOnlyField label="Status" value={project.status} />
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2 pt-2 border-t">
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4 mr-2" /> Delete Project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Project</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this project? This action cannot
                be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Project Tasks
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {tasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No tasks yet. Create tasks in ERPNext to track wedding
                      preparation.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {tasks.map((task: any) => (
                        <div
                          key={task.name}
                          className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {task.subject}
                            </p>
                            {task.exp_end_date && (
                              <p className="text-xs text-muted-foreground">
                                Due: {formatDate(task.exp_end_date)}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
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
                      ))}
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
