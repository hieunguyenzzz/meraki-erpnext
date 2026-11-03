import { useParams } from "react-router";
import { useOne, useList, useDelete, useInvalidate, useNavigation } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sparkles } from "lucide-react";
import { DetailSkeleton } from "@/components/detail-skeleton";
import { ConversationSection } from "@/components/crm/ConversationSection";
import { SuggestedResponseSection } from "@/components/crm/SuggestedResponseSection";
import { InternalNotesSection } from "@/components/crm/ActivitySection";
import { LeadHeader } from "@/components/crm/lead/LeadHeader";
import { DateConflictAlert, type ConflictLead, type ConflictOrder } from "@/components/crm/lead/DateConflictAlert";
import { ContactCard, WeddingCard, SubmissionCard, MeetingsCard, type Meeting } from "@/components/crm/lead/LeadCards";
import { LeadMetaCard } from "@/components/crm/lead/LeadMetaCard";

export default function LeadDetailPage() {
  const { name } = useParams<{ name: string }>();
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
  const { data: scheduledMeetings = [], isError: meetingsError } = useQuery({
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
      if (!res.ok) {
        console.error(`LeadDetailPage: meetings request failed (${res.status})`);
        throw new Error(`Meetings failed (${res.status})`);
      }
      const data = await res.json();
      return (data.message ?? []) as Meeting[];
    },
    enabled: !!name,
  });

  const conflictingLeads = (conflictingLeadsResult?.data ?? []) as ConflictLead[];
  const conflictingSalesOrders = (conflictingSalesOrdersResult?.data ?? []) as ConflictOrder[];

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

  // Lead.notes is a CRM Note child table; the website form writes the whole
  // enquiry (role, partner, extra events, other notes...) as one block per row.
  const submissionNotes: string[] = (lead.notes ?? [])
    .map((row: { note?: string }) => row?.note?.trim())
    .filter((note: string | undefined): note is string => Boolean(note));

  const references = [
    { doctype: "Lead", docName: name! },
    ...(linkedOpportunity ? [{ doctype: "Opportunity", docName: linkedOpportunity.name }] : []),
  ];

  return (
    <div className="space-y-4">
      <LeadHeader name={lead.lead_name} status={lead.status} email={lead.email_id} phone={lead.phone} />

      <DateConflictAlert date={weddingDate ?? ""} leads={conflictingLeads} orders={conflictingSalesOrders} />

      {/* Phones: cards, then the thread, then Meta. Desktop: cards in a left column, thread on the right. */}
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-6">
        <div className="space-y-4 lg:col-start-1 lg:row-start-1">
          <ContactCard lead={lead} fullName={fullName} sources={leadSources} onSaved={handleFieldSaved} />
          <WeddingCard lead={lead} />
          <SubmissionCard notes={submissionNotes} />
          <MeetingsCard meetings={scheduledMeetings} error={meetingsError} />
        </div>

        <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {lead.custom_ai_summary && (
            <Card className="mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4 text-warning" aria-hidden />
                  Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="sm:pt-0">
                <p className="whitespace-pre-line text-sm text-muted-foreground">{lead.custom_ai_summary}</p>
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="conversation" className="w-full">
            <TabsList className="w-full lg:w-auto">
              <TabsTrigger value="conversation" className="flex-1 lg:flex-none">Conversation</TabsTrigger>
              <TabsTrigger value="activity" className="flex-1 lg:flex-none">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="conversation" className="mt-4">
              <ConversationSection references={references} leadName={lead.lead_name} />
              {/* AI Suggested Response */}
              <SuggestedResponseSection
                leadName={lead.lead_name}
                references={references}
                weddingDate={lead.custom_wedding_date}
                venue={lead.custom_wedding_venue}
                budget={lead.custom_budget_raw || (lead.custom_estimated_budget ? String(lead.custom_estimated_budget) : undefined)}
                guestCount={lead.custom_guest_count_raw || (lead.custom_guest_count ? String(lead.custom_guest_count) : undefined)}
              />
            </TabsContent>
            <TabsContent value="activity" className="mt-4">
              <InternalNotesSection references={references} />
            </TabsContent>
          </Tabs>
        </div>

        <div className="lg:col-start-1 lg:row-start-2">
          <LeadMetaCard created={lead.creation} id={lead.name} status={lead.status} onDelete={handleDelete} />
        </div>
      </div>
    </div>
  );
}
