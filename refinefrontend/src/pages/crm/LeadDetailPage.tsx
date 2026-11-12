import { useParams } from "react-router";
import { useMemo, useState } from "react";
import { useOne, useList, useDelete, useUpdate, useInvalidate, useNavigation } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { COLUMNS, type ColumnKey } from "@/lib/kanban";
import { Sparkles } from "lucide-react";
import { DetailSkeleton } from "@/components/detail-skeleton";
import { useConversationItems } from "@/components/crm/useConversationItems";
import { useActivityItems } from "@/components/crm/useActivityItems";
import { LeadConversationTab } from "@/components/crm/lead/LeadConversationTab";
import { LeadActivityTab } from "@/components/crm/lead/LeadActivityTab";
import { SummaryText } from "@/components/crm/lead/SummaryText";
import { DeleteLeadDialog } from "@/components/crm/lead/DeleteLeadDialog";
import { LeadHeader } from "@/components/crm/lead/LeadHeader";
import { DateConflictAlert, type ConflictLead, type ConflictOrder } from "@/components/crm/lead/DateConflictAlert";
import { ContactCard, WeddingCard, SubmissionCard, MeetingsCard, type Meeting } from "@/components/crm/lead/LeadCards";

export default function LeadDetailPage() {
  const { name } = useParams<{ name: string }>();
  const invalidate = useInvalidate();
  const { mutateAsync: deleteRecord } = useDelete();
  const { mutateAsync: updateRecord } = useUpdate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [stageBusy, setStageBusy] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);
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

  async function handleStage(key: ColumnKey) {
    const target = COLUMNS.find((c) => c.key === key)!.leadTarget;
    setStageBusy(true);
    setStageError(null);
    try {
      await updateRecord({ resource: "Lead", id: name!, values: { status: target }, successNotification: false });
      invalidate({ resource: "Lead", invalidates: ["list", "detail"] });
    } catch (err) {
      console.error(`LeadDetailPage: stage change to ${target} failed for ${name}`, err);
      setStageError("The stage was not changed. Try again.");
    } finally {
      setStageBusy(false);
    }
  }

  const linkedOpportunityName: string | undefined = linkedOpportunity?.name;
  const references = useMemo(
    () => [
      { doctype: "Lead", docName: name! },
      ...(linkedOpportunityName ? [{ doctype: "Opportunity", docName: linkedOpportunityName }] : []),
    ],
    [name, linkedOpportunityName],
  );
  const { items: conversation, capped: conversationCapped } = useConversationItems(references);
  const { items: activity, loaded: activityLoaded, capped: activityCapped, notesCapped } = useActivityItems(references);
  const count = (n: number, capped: boolean) => (capped ? `${n}+` : String(n));
  // Notes and stage history only: the emails in the activity list are not deleted with the lead.
  const noteCount = activity.filter((a) => a.type === "note" || a.type === "stage_change").length;

  if (!lead) {
    return <DetailSkeleton />;
  }

  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.lead_name;

  // Lead.notes is a CRM Note child table; the website form writes the whole
  // enquiry (role, partner, extra events, other notes...) as one block per row.
  const submissionNotes: string[] = (lead.notes ?? [])
    .map((row: { note?: string }) => row?.note?.trim())
    .filter((note: string | undefined): note is string => Boolean(note));

  const tab = "h-11 flex-none px-0 text-[15px] font-semibold text-muted-foreground data-[state=active]:text-foreground";

  return (
    <div className="space-y-4">
      <LeadHeader
        name={lead.lead_name}
        status={lead.status}
        email={lead.email_id}
        phone={lead.phone}
        stageBusy={stageBusy}
        onStage={handleStage}
        onDelete={() => setConfirmDelete(true)}
      />
      {stageError && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">{stageError}</p>}

      <DateConflictAlert date={weddingDate ?? ""} leads={conflictingLeads} orders={conflictingSalesOrders} />

      {/* Phones: cards, then the thread. Desktop: cards in a left column, thread on the right. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] lg:items-start lg:gap-4">
        <div className="space-y-3.5">
          <ContactCard lead={lead} fullName={fullName} sources={leadSources} onSaved={handleFieldSaved} />
          <WeddingCard lead={lead} />
          <SubmissionCard notes={submissionNotes} />
          <MeetingsCard meetings={scheduledMeetings} error={meetingsError} />
        </div>

        <div className="min-w-0 space-y-3.5">
          {lead.custom_ai_summary && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4 text-warning" aria-hidden />
                  Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="sm:pt-0">
                <SummaryText text={lead.custom_ai_summary} />
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="conversation" className="w-full space-y-3.5">
            <TabsList className="w-full gap-[26px]">
              <TabsTrigger value="conversation" className={tab}>Conversation · {count(conversation.length, conversationCapped)}</TabsTrigger>
              <TabsTrigger value="activity" className={tab}>Activity · {count(activity.length + 1, activityCapped)}</TabsTrigger>
            </TabsList>
            <TabsContent value="conversation" className="mt-0">
              <LeadConversationTab
                items={conversation}
                leadName={lead.lead_name}
                suggestion={{
                  leadName: lead.lead_name,
                  references,
                  weddingDate: lead.custom_wedding_date,
                  venue: lead.custom_wedding_venue,
                  budget: lead.custom_budget_raw || (lead.custom_estimated_budget ? String(lead.custom_estimated_budget) : undefined),
                  guestCount: lead.custom_guest_count_raw || (lead.custom_guest_count ? String(lead.custom_guest_count) : undefined),
                }}
              />
            </TabsContent>
            <TabsContent value="activity" className="mt-0">
              <LeadActivityTab items={activity} leadName={lead.lead_name} primaryRef={references[0]} created={lead.creation} source={lead.source} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <DeleteLeadDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        name={lead.lead_name}
        notes={activityLoaded ? count(noteCount, notesCapped) : undefined}
        onConfirm={handleDelete}
      />
    </div>
  );
}
