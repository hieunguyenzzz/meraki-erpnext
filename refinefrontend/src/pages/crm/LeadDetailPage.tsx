import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useOne, useList, useDelete, useInvalidate, useNavigation } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";
import { formatDate, formatVND } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Trash2, CalendarDays, ChevronDown, ArrowLeft, Mail, Phone, MapPin } from "lucide-react";
import { DetailSkeleton } from "@/components/detail-skeleton";
import { ReadOnlyField } from "@/components/crm/ReadOnlyField";
import { EditableField } from "@/components/crm/EditableField";
import { ConversationSection } from "@/components/crm/ConversationSection";
import { SuggestedResponseSection } from "@/components/crm/SuggestedResponseSection";
import { InternalNotesSection } from "@/components/crm/ActivitySection";
import { cn } from "@/lib/utils";

function statusVariant(status: string) {
  switch (status) {
    case "Lead": return "info" as const;
    case "Open": return "warning" as const;
    case "Replied": case "Interested": case "Converted": case "Opportunity": case "Quotation": return "success" as const;
    case "Lost Quotation": case "Do Not Contact": return "destructive" as const;
    default: return "secondary" as const;
  }
}

/** Inline contact info item */
function ContactItem({ icon: Icon, value, href }: { icon: typeof Mail; value?: string; href?: string }) {
  if (!value) return null;
  const content = (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{value}</span>
    </span>
  );
  if (href) {
    return <a href={href} className="hover:text-foreground transition-colors">{content}</a>;
  }
  return content;
}

export default function LeadDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [mobileInfoOpen, setMobileInfoOpen] = useState(false);

  const invalidate = useInvalidate();
  const { mutateAsync: deleteRecord } = useDelete();
  const { list } = useNavigation();
  const { result: lead } = useOne({ resource: "Lead", id: name! });

  // Linked Opportunity (for conversation display)
  const { result: linkedOpportunityResult } = useList({
    resource: "Opportunity",
    pagination: { mode: "off" as const },
    filters: [
      { field: "opportunity_from", operator: "eq", value: "Lead" },
      { field: "party_name", operator: "eq", value: name! },
    ],
    meta: { fields: ["name"] },
    queryOptions: { enabled: !!name },
  });
  const linkedOpportunity = (linkedOpportunityResult?.data ?? [])[0];

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

  // Sidebar content (reused in both desktop and mobile)
  const SidebarContent = () => (
    <div className="space-y-6">
      {/* Contact Info */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contact</h3>
        <div className="space-y-2">
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
        </div>
      </div>

      {/* Wedding Details - display raw values for form submission fidelity */}
      {(lead.custom_wedding_date_raw || lead.custom_wedding_date || lead.custom_wedding_venue || lead.custom_guest_count_raw || lead.custom_guest_count || lead.custom_budget_raw || lead.custom_estimated_budget || lead.custom_couple_name) && (
        <div className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Wedding</h3>
          <div className="space-y-2">
            {(lead.custom_wedding_date_raw || lead.custom_wedding_date) && (
              <ReadOnlyField label="Date" value={lead.custom_wedding_date_raw || formatDate(lead.custom_wedding_date)} />
            )}
            {lead.custom_wedding_venue && <ReadOnlyField label="Venue" value={lead.custom_wedding_venue} />}
            {(lead.custom_guest_count_raw || lead.custom_guest_count) && (
              <ReadOnlyField label="Guests" value={lead.custom_guest_count_raw || String(lead.custom_guest_count)} />
            )}
            {(lead.custom_budget_raw || lead.custom_estimated_budget) && (
              <ReadOnlyField label="Budget" value={lead.custom_budget_raw || formatVND(lead.custom_estimated_budget)} />
            )}
            {lead.custom_couple_name && <ReadOnlyField label="Couple" value={lead.custom_couple_name} />}
          </div>
        </div>
      )}

      {/* Scheduled Meetings */}
      {scheduledMeetings.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-cyan-600" />
            Meetings
          </h3>
          <div className="space-y-2">
            {scheduledMeetings.map((meeting) => {
              const startDate = new Date(meeting.starts_on);
              const isPast = startDate < new Date();
              return (
                <div
                  key={meeting.name}
                  className={cn(
                    "p-2.5 rounded-md border text-sm",
                    isPast
                      ? "bg-muted/30 border-muted text-muted-foreground"
                      : "bg-cyan-50/50 dark:bg-cyan-950/20 border-cyan-200/60 dark:border-cyan-800/60"
                  )}
                >
                  <p className={cn("font-medium", isPast && "line-through")}>
                    {meeting.subject}
                  </p>
                  <p className={cn("text-xs mt-0.5", isPast ? "text-muted-foreground" : "text-cyan-700 dark:text-cyan-400")}>
                    {startDate.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                    {" at "}
                    {startDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Meta */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Meta</h3>
        <div className="space-y-2">
          <ReadOnlyField label="Created" value={formatDate(lead.creation)} />
          <ReadOnlyField label="ID" value={lead.name} />
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2 pt-2 border-t">
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4 mr-2" /> Delete Lead
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
  );

  return (
    <div className="space-y-4">
      {/* Mobile Header */}
      <div className="lg:hidden">
        <div className="flex items-center gap-3 mb-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold tracking-tight truncate">{lead.lead_name}</h1>
          </div>
          <Badge variant={statusVariant(lead.status)} className="shrink-0">{lead.status}</Badge>
        </div>

        {/* Mobile contact info summary */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mb-3">
          <ContactItem icon={Mail} value={lead.email_id} href={`mailto:${lead.email_id}`} />
          <ContactItem icon={Phone} value={lead.phone} href={`tel:${lead.phone}`} />
          {lead.city && <ContactItem icon={MapPin} value={lead.city} />}
        </div>

        {/* Collapsible details */}
        <Collapsible open={mobileInfoOpen} onOpenChange={setMobileInfoOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="w-full justify-between mb-4">
              {mobileInfoOpen ? "Hide details" : "Show all details"}
              <ChevronDown className={cn("h-4 w-4 transition-transform", mobileInfoOpen && "rotate-180")} />
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
          <h1 className="text-2xl font-semibold tracking-tight">{lead.lead_name}</h1>
          <Badge variant={statusVariant(lead.status)}>{lead.status}</Badge>
        </div>
      </div>

      {/* Date conflict warning */}
      {hasDateConflicts && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 text-amber-800 dark:text-amber-400">
          <p className="font-medium text-sm mb-1">Date Conflict: {formatDate(weddingDate!)}</p>
          <ul className="text-sm space-y-0.5 ml-4 list-disc">
            {conflictingLeads.map((cl) => (
              <li key={cl.name}>
                <Link to={`/crm/leads/${cl.name}`} className="font-medium hover:underline">{cl.lead_name}</Link>{" "}
                <span className="text-amber-600 dark:text-amber-500">({cl.status})</span>
              </li>
            ))}
            {conflictingSalesOrders.map((so) => (
              <li key={so.name}>
                Wedding: {so.customer_name} <span className="text-amber-600 dark:text-amber-500">({so.name})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
          {/* Notes (shown above tabs if present) */}
          {Array.isArray(lead.notes) && lead.notes.length > 0 && (
            <Card className="mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {lead.notes.map((note, idx) => (
                    <p key={idx} className="text-sm whitespace-pre-wrap text-muted-foreground">{note.note}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="conversation" className="w-full">
            <TabsList className="w-full lg:w-auto">
              <TabsTrigger value="conversation" className="flex-1 lg:flex-none">Conversation</TabsTrigger>
              <TabsTrigger value="activity" className="flex-1 lg:flex-none">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="conversation" className="mt-4">
              <ConversationSection references={[
                { doctype: "Lead", docName: name! },
                ...(linkedOpportunity ? [{ doctype: "Opportunity", docName: linkedOpportunity.name }] : []),
              ]} />
              {/* AI Suggested Response */}
              <SuggestedResponseSection
                leadName={lead.lead_name}
                references={[
                  { doctype: "Lead", docName: name! },
                  ...(linkedOpportunity ? [{ doctype: "Opportunity", docName: linkedOpportunity.name }] : []),
                ]}
                weddingDate={lead.custom_wedding_date}
                venue={lead.custom_wedding_venue}
                budget={lead.custom_budget_raw || (lead.custom_estimated_budget ? String(lead.custom_estimated_budget) : undefined)}
                guestCount={lead.custom_guest_count_raw || (lead.custom_guest_count ? String(lead.custom_guest_count) : undefined)}
              />
            </TabsContent>
            <TabsContent value="activity" className="mt-4">
              <InternalNotesSection references={[
                { doctype: "Lead", docName: name! },
                ...(linkedOpportunity ? [{ doctype: "Opportunity", docName: linkedOpportunity.name }] : []),
              ]} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
