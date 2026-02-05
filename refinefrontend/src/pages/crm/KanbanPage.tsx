import { useMemo } from "react";
import { useList } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { buildKanbanItems, enrichWithActivity, enrichWithMeetings } from "@/lib/kanban";
import { Skeleton } from "@/components/ui/skeleton";

// Simplified Lead-only CRM: All stages use Lead doctype (no Opportunity conversion)
// Drag and drop disabled - leads are moved via webhook API only

export default function KanbanPage() {

  const { result: leadsResult, query: leadsQuery } = useList({
    resource: "Lead",
    pagination: { mode: "off" },
    meta: {
      fields: ["name", "lead_name", "status", "email_id", "phone", "creation"],
    },
  });

  const { result: oppsResult, query: oppsQuery } = useList({
    resource: "Opportunity",
    pagination: { mode: "off" },
    meta: {
      fields: ["name", "party_name", "customer_name", "status", "contact_email", "contact_mobile", "creation"],
    },
  });

  const ninetyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  }, []);

  const { result: commsResult, query: commsQuery } = useList({
    resource: "Communication",
    pagination: { mode: "off" },
    sorters: [{ field: "communication_date", order: "desc" }],
    filters: [
      { field: "reference_doctype", operator: "in", value: ["Lead", "Opportunity"] },
      { field: "communication_type", operator: "eq", value: "Communication" },
      { field: "communication_date", operator: "gte", value: ninetyDaysAgo },
    ],
    meta: {
      fields: ["name", "reference_doctype", "reference_name", "sent_or_received", "communication_date", "creation"],
    },
  });

  // Fetch Events with Lead participants using direct API call
  // frappe.client.get_list supports child table filters and fields
  const { data: eventsWithParticipants } = useQuery({
    queryKey: ["events-with-lead-participants"],
    queryFn: async () => {
      const params = new URLSearchParams({
        doctype: "Event",
        fields: JSON.stringify([
          "name", "subject", "starts_on", "ends_on",
          "`tabEvent Participants`.reference_doctype",
          "`tabEvent Participants`.reference_docname"
        ]),
        filters: JSON.stringify([["Event Participants", "reference_doctype", "=", "Lead"]]),
        limit_page_length: "0",
      });
      const res = await fetch(`/api/method/frappe.client.get_list?${params}`, {
        credentials: "include",
        headers: { "X-Frappe-Site-Name": "erp.merakiwp.com" },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.message ?? [];
    },
  });

  // Build meeting data: map Lead name to earliest meeting date
  const meetingEvents = useMemo(() => {
    const events = eventsWithParticipants ?? [];
    const result: { reference_docname: string; starts_on: string }[] = [];

    for (const e of events) {
      if (e.reference_docname && e.starts_on) {
        result.push({
          reference_docname: e.reference_docname,
          starts_on: e.starts_on,
        });
      }
    }
    return result;
  }, [eventsWithParticipants]);

  const items = useMemo(() => {
    const base = buildKanbanItems(leadsResult?.data ?? [], oppsResult?.data ?? []);
    const withActivity = enrichWithActivity(base, commsResult?.data ?? []);
    return enrichWithMeetings(withActivity, meetingEvents);
  }, [leadsResult, oppsResult, commsResult, meetingEvents]);

  const isLoading = leadsQuery?.isLoading || oppsQuery?.isLoading || commsQuery?.isLoading;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">CRM Pipeline</h1>
        <p className="text-sm text-muted-foreground">View leads by stage</p>
      </div>
      {isLoading ? (
        <>
          {/* Desktop skeleton */}
          <div className="hidden md:grid grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-muted p-3 space-y-3 min-h-[300px]">
                <Skeleton className="h-4 w-[60px]" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ))}
          </div>
          {/* Mobile skeleton */}
          <div className="md:hidden space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-20 shrink-0 rounded-lg" />
              ))}
            </div>
            <div className="rounded-lg border border-muted p-3 space-y-3 min-h-[200px]">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        </>
      ) : (
        <>
          <KanbanBoard items={items} />
          <div className="hidden md:block mt-6 text-xs text-muted-foreground">
            <p className="mb-2 font-medium text-foreground uppercase tracking-wide">Stage Guide</p>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
              <div><span className="font-medium text-foreground">New</span> — Fresh inquiry</div>
              <div><span className="font-medium text-foreground">Engaged</span> — In conversation</div>
              <div><span className="font-medium text-foreground">Meeting</span> — Meeting scheduled</div>
              <div><span className="font-medium text-foreground">Quoted</span> — Quote sent</div>
              <div><span className="font-medium text-foreground">Won</span> — Deal closed</div>
              <div><span className="font-medium text-foreground">Lost</span> — Did not proceed</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
