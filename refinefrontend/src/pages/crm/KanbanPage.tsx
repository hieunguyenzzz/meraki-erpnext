import { useMemo, useState } from "react";
import { useList } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";
import { useQueryState, parseAsStringLiteral } from "nuqs";
import { Plus } from "lucide-react";
import { PipelineBoard } from "@/components/crm/pipeline/PipelineBoard";
import { PipelineFilters, WAITING_VALUES, SORT_VALUES } from "@/components/crm/pipeline/PipelineFilters";
import { CreateLeadSheet } from "@/components/crm/pipeline/CreateLeadSheet";
import { ErrorPanel } from "@/components/chats/ChatStates";
import { buildKanbanItems, enrichWithActivity, enrichWithMeetings, getColumnForItem, awaitingOf, COLUMNS } from "@/lib/kanban";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

// Simplified Lead-only CRM: All stages use Lead doctype (no Opportunity conversion)
// Drag and drop disabled - leads are moved via webhook API only

const STAGE_VALUES = COLUMNS.map((c) => c.key);

export default function KanbanPage() {
  const [createOpen, setCreateOpen] = useState(false);

  // Filter state
  // Kept in the URL so Back from a lead returns to the same stage and filters.
  const [waitingFilter, setWaitingFilter] = useQueryState("awaiting", parseAsStringLiteral(WAITING_VALUES).withDefault("all").withOptions({ clearOnDefault: true }));
  const [locationParam, setLocationParam] = useQueryState("location", { defaultValue: "", clearOnDefault: true });
  const [sortOrder, setSortOrder] = useQueryState("sort", parseAsStringLiteral(SORT_VALUES).withDefault("newest").withOptions({ clearOnDefault: true }));
  const [stage, setStage] = useQueryState("stage", parseAsStringLiteral(STAGE_VALUES).withDefault("new").withOptions({ clearOnDefault: true }));
  const locationFilter = locationParam || null;
  const setLocationFilter = (loc: string | null) => setLocationParam(loc ?? "");

  // Fetch Leads with city field for location filter
  const { result: leadsResult, query: leadsQuery } = useList({
    resource: "Lead",
    pagination: { mode: "off" },
    meta: {
      fields: ["name", "lead_name", "status", "email_id", "phone", "creation", "city",
        "source", "custom_wedding_date", "custom_wedding_date_raw", "custom_budget_raw"],
    },
  });

  const { result: oppsResult, query: oppsQuery } = useList({
    resource: "Opportunity",
    pagination: { mode: "off" },
    meta: {
      fields: ["name", "party_name", "customer_name", "status", "contact_email", "contact_mobile", "creation"],
    },
  });

  const { result: commsResult, query: commsQuery } = useList({
    resource: "Communication",
    pagination: { mode: "off" },
    sorters: [{ field: "communication_date", order: "desc" }],
    filters: [
      { field: "reference_doctype", operator: "in", value: ["Lead", "Opportunity"] },
      { field: "communication_type", operator: "eq", value: "Communication" },
    ],
    meta: {
      fields: ["name", "reference_doctype", "reference_name", "sent_or_received", "communication_date", "creation"],
    },
  });

  // Fetch Events with Lead participants using direct API call
  // frappe.client.get_list supports child table filters and fields
  const { data: eventsWithParticipants, isError: meetingsError } = useQuery({
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
      if (!res.ok) {
        console.error(`KanbanPage: meetings request failed (${res.status})`);
        throw new Error(`Meetings failed (${res.status})`);
      }
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

  // Build lead location map for filtering
  const leadLocationMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const lead of leadsResult?.data ?? []) {
      if (lead.city) {
        map.set(lead.name, lead.city);
      }
    }
    return map;
  }, [leadsResult]);

  // Extract unique locations for filter dropdown
  const availableLocations = useMemo(() => {
    const locations = new Set<string>();
    for (const lead of leadsResult?.data ?? []) {
      if (lead.city && lead.city.trim()) {
        locations.add(lead.city.trim());
      }
    }
    return Array.from(locations).sort();
  }, [leadsResult]);

  // Build and filter items
  const items = useMemo(() => {
    const base = buildKanbanItems(leadsResult?.data ?? [], oppsResult?.data ?? []);
    const withActivity = enrichWithActivity(base, commsResult?.data ?? []);
    const withMeetings = enrichWithMeetings(withActivity, meetingEvents);

    // Apply filters
    let filtered = withMeetings;

    // Filter by waiting status
    if (waitingFilter !== "all") {
      // Same rule as the card badge, so the filter never disagrees with what the cards say.
      filtered = filtered.filter((item) => awaitingOf(item) === waitingFilter);
    }

    // Filter by location
    if (locationFilter) {
      filtered = filtered.filter((item) => {
        if (item.doctype !== "Lead") return false;
        const docName = item.id.split("::")[1];
        return leadLocationMap.get(docName) === locationFilter;
      });
    }

    // Sort by last activity date
    filtered.sort((a, b) => {
      const dateA = a.lastActivity?.date || a.creation;
      const dateB = b.lastActivity?.date || b.creation;
      const comparison = new Date(dateB).getTime() - new Date(dateA).getTime();
      return sortOrder === "newest" ? comparison : -comparison;
    });

    return filtered;
  }, [leadsResult, oppsResult, commsResult, meetingEvents, waitingFilter, locationFilter, sortOrder, leadLocationMap]);

  const isLoading = leadsQuery?.isLoading || oppsQuery?.isLoading || commsQuery?.isLoading;
  const isError = leadsQuery?.isError || oppsQuery?.isError || commsQuery?.isError;
  const openCount = items.filter((i) => !["won", "lost"].includes(getColumnForItem(i))).length;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl font-semibold leading-tight md:text-4xl">Leads</h1>
          {!isLoading && !isError && <p className="text-sm text-muted-foreground">{openCount} open</p>}
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden />
          New lead
        </Button>
      </header>
      <CreateLeadSheet open={createOpen} onOpenChange={setCreateOpen} />

      <PipelineFilters
        waitingFilter={waitingFilter}
        onWaitingFilterChange={setWaitingFilter}
        locationFilter={locationFilter}
        onLocationFilterChange={setLocationFilter}
        locations={availableLocations}
        sortOrder={sortOrder}
        onSortOrderChange={setSortOrder}
      />

      {isError ? (
        <ErrorPanel
          title="Couldn't load leads"
          onRetry={() => { leadsQuery.refetch(); oppsQuery.refetch(); commsQuery.refetch(); }}
        />
      ) : isLoading ? (
        <div aria-busy="true" aria-label="Loading leads">
          <div className="hidden gap-3 md:flex">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="w-[248px] shrink-0 space-y-2.5 rounded-card bg-secondary p-3">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ))}
          </div>
          <div className="space-y-3 md:hidden">
            <div className="flex gap-2 overflow-hidden">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-24 shrink-0 rounded-full" />)}
            </div>
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-card" />)}
          </div>
        </div>
      ) : (
        <>
          {meetingsError && <p role="status" className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">Couldn't load meetings, so meeting times are missing from the cards.</p>}
          <PipelineBoard items={items} stage={stage} onStageChange={setStage} />
        </>
      )}
    </div>
  );
}
