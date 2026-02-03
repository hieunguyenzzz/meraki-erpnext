import { useState } from "react";
import { useParams, Link } from "react-router";
import { useOne, useList, useCreate, useDelete, useInvalidate, useNavigation } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";
import { formatDate, formatVND } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Trash2, ArrowRightLeft, CalendarDays } from "lucide-react";
import { extractErrorMessage } from "@/lib/errors";
import { DetailSkeleton } from "@/components/detail-skeleton";
import { ReadOnlyField } from "@/components/crm/ReadOnlyField";
import { EditableField } from "@/components/crm/EditableField";
import { ConversationSection } from "@/components/crm/ConversationSection";
import { InternalNotesSection } from "@/components/crm/ActivitySection";

const TERMINAL_LEAD_STATUSES = new Set(["Converted", "Do Not Contact", "Opportunity"]);

function statusVariant(status: string) {
  switch (status) {
    case "Lead": return "info" as const;
    case "Open": return "warning" as const;
    case "Replied": case "Interested": case "Converted": case "Opportunity": case "Quotation": return "success" as const;
    case "Lost Quotation": case "Do Not Contact": return "destructive" as const;
    default: return "secondary" as const;
  }
}

export default function LeadDetailPage() {
  const { name } = useParams<{ name: string }>();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [converting, setConverting] = useState(false);

  const invalidate = useInvalidate();
  const { mutateAsync: deleteRecord } = useDelete();
  const { list } = useNavigation();
  const { result: lead } = useOne({ resource: "Lead", id: name! });

  const { mutateAsync: createDoc } = useCreate();

  // Lead Sources for dropdown
  const { result: sourcesResult } = useList({
    resource: "Lead Source",
    pagination: { mode: "off" as const },
    meta: { fields: ["name"] },
  });
  const leadSources = (sourcesResult?.data ?? []).map((s: any) => s.name);

  const weddingDate = lead?.custom_wedding_date;

  // Conflicting leads with same wedding date
  const { result: conflictingLeadsResult } = useList({
    resource: "Lead",
    pagination: { mode: "off" as const },
    filters: [
      { field: "custom_wedding_date", operator: "eq", value: weddingDate! },
      { field: "name", operator: "ne", value: name! },
    ],
    meta: { fields: ["name", "lead_name", "status"] },
    queryOptions: { enabled: !!weddingDate },
  });

  // Conflicting submitted Sales Orders (weddings) on same date
  const { result: conflictingSalesOrdersResult } = useList({
    resource: "Sales Order",
    pagination: { mode: "off" as const },
    filters: [
      { field: "delivery_date", operator: "eq", value: weddingDate! },
      { field: "docstatus", operator: "eq", value: 1 },
    ],
    meta: { fields: ["name", "customer_name", "status"] },
    queryOptions: { enabled: !!weddingDate },
  });

  // Fetch Events linked to this Lead using direct API call
  const { data: scheduledMeetings = [] } = useQuery({
    queryKey: ["lead-meetings", name],
    queryFn: async () => {
      if (!name) return [];
      const params = new URLSearchParams({
        doctype: "Event",
        fields: JSON.stringify(["name", "subject", "starts_on", "ends_on"]),
        filters: JSON.stringify([
          ["Event Participants", "reference_doctype", "=", "Lead"],
          ["Event Participants", "reference_docname", "=", name],
        ]),
        order_by: "starts_on asc",
        limit_page_length: "0",
      });
      const res = await fetch(`/api/method/frappe.client.get_list?${params}`, {
        credentials: "include",
        headers: { "X-Frappe-Site-Name": "erp.merakiwp.com" },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.message ?? []) as Array<{ name: string; subject: string; starts_on: string; ends_on?: string }>;
    },
    enabled: !!name,
  });

  const conflictingLeads = (conflictingLeadsResult?.data ?? []) as Array<{ name: string; lead_name: string; status: string }>;
  const conflictingSalesOrders = (conflictingSalesOrdersResult?.data ?? []) as Array<{ name: string; customer_name: string; status: string }>;
  const hasDateConflicts = conflictingLeads.length > 0 || conflictingSalesOrders.length > 0;

  async function handleConvert() {
    if (!lead || converting) return;
    setConverting(true);
    try {
      const result = await createDoc({
        resource: "Opportunity",
        values: {
          opportunity_from: "Lead",
          party_name: lead.name,
          status: "Open",
          source: lead.source ?? "",
        },
      });
      setConvertOpen(false);
      const newName = (result as any)?.data?.name;
      if (newName) {
        list("Opportunity");
      }
    } catch (err) {
      console.error("Failed to convert lead:", err);
      alert(extractErrorMessage(err, "Failed to convert to Opportunity."));
    } finally {
      setConverting(false);
    }
  }

  async function handleDelete() {
    await deleteRecord({ resource: "Lead", id: name! });
    list("Lead");
  }

  function handleFieldSaved() {
    invalidate({ resource: "Lead", invalidates: ["detail"], id: name! });
  }

  if (!lead) {
    return <DetailSkeleton />;
  }

  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.lead_name;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{lead.lead_name}</h1>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant(lead.status)}>{lead.status}</Badge>
          <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={TERMINAL_LEAD_STATUSES.has(lead.status)}>
                <ArrowRightLeft className="h-4 w-4 mr-1" /> Convert to Opportunity
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Convert to Opportunity</DialogTitle>
                <DialogDescription>
                  This will create a new Opportunity linked to this Lead. The Lead will be marked as converted.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConvertOpen(false)}>Cancel</Button>
                <Button onClick={handleConvert} disabled={converting}>
                  {converting ? "Converting..." : "Convert"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Lead</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete this lead? This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                <Button variant="destructive" onClick={handleDelete}>Delete</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Date conflict warning */}
      {hasDateConflicts && (
        <div className="rounded-lg border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-950/30 px-4 py-3 text-yellow-800 dark:text-yellow-400">
          <p className="font-medium mb-1">Date Conflict: {formatDate(weddingDate!)} has other events</p>
          <ul className="text-sm space-y-1 ml-4 list-disc">
            {conflictingLeads.map((cl) => (
              <li key={cl.name}>
                Lead: <Link to={`/crm/leads/${cl.name}`} className="font-medium underline hover:no-underline">{cl.lead_name}</Link>{" "}
                <span className="text-yellow-600 dark:text-yellow-500">({cl.status})</span>
              </li>
            ))}
            {conflictingSalesOrders.map((so) => (
              <li key={so.name}>
                Wedding: {so.customer_name} <span className="text-yellow-600 dark:text-yellow-500">({so.name})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Two-column grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ReadOnlyField label="Name" value={fullName} />
            <ReadOnlyField label="Email" value={lead.email_id ?? ""} />
            <ReadOnlyField label="Phone" value={lead.phone ?? ""} />
            {lead.mobile_no && <ReadOnlyField label="Mobile" value={lead.mobile_no} />}
            <ReadOnlyField label="Location" value={lead.city ?? ""} />
            <EditableField
              label="Source"
              value={lead.source}
              fieldName="source"
              doctype="Lead"
              docName={lead.name}
              type="select"
              options={leadSources}
              onSaved={handleFieldSaved}
            />
            <ReadOnlyField label="Created" value={formatDate(lead.creation)} />
          </CardContent>
        </Card>

        {/* Wedding Details */}
        <Card>
          <CardHeader>
            <CardTitle>Wedding Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ReadOnlyField label="Relationship" value={lead.custom_relationship ?? ""} />
            <ReadOnlyField label="Couple Name" value={lead.custom_couple_name ?? ""} />
            <ReadOnlyField label="Wedding Date" value={lead.custom_wedding_date ? formatDate(lead.custom_wedding_date) : ""} />
            <ReadOnlyField label="Wedding Venue" value={lead.custom_wedding_venue ?? ""} />
            <ReadOnlyField label="Guest Count" value={lead.custom_guest_count ? String(lead.custom_guest_count) : ""} />
            <ReadOnlyField label="Estimated Budget" value={lead.custom_estimated_budget ? formatVND(lead.custom_estimated_budget) : ""} />
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {typeof lead.notes === "string" && lead.notes.trim() && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{lead.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Scheduled Meetings */}
      {scheduledMeetings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
              Scheduled Meetings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {scheduledMeetings.map((meeting) => {
                const startDate = new Date(meeting.starts_on);
                const isPast = startDate < new Date();
                return (
                  <div
                    key={meeting.name}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${
                      isPast
                        ? "bg-muted/50 border-muted"
                        : "bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-800"
                    }`}
                  >
                    <div className="flex-1">
                      <p className={`font-medium ${isPast ? "text-muted-foreground" : "text-foreground"}`}>
                        {meeting.subject}
                      </p>
                      <p className={`text-sm ${isPast ? "text-muted-foreground" : "text-cyan-700 dark:text-cyan-400"}`}>
                        {startDate.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                        {" at "}
                        {startDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    {isPast && (
                      <Badge variant="secondary" className="text-xs">Past</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Conversation */}
      <ConversationSection references={[{ doctype: "Lead", docName: name! }]} />

      {/* Internal Notes */}
      <InternalNotesSection references={[{ doctype: "Lead", docName: name! }]} />
    </div>
  );
}
