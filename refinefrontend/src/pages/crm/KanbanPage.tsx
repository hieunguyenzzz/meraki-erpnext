import { useMemo, useCallback, useState } from "react";
import { useList, useCustomMutation, useInvalidate } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { MeetingScheduleDialog } from "@/components/crm/MeetingScheduleDialog";
import { buildKanbanItems, enrichWithActivity, enrichWithMeetings, getDocName, type KanbanItem, type ColumnKey } from "@/lib/kanban";
import { extractErrorMessage } from "@/lib/errors";
import { Skeleton } from "@/components/ui/skeleton";

export default function KanbanPage() {
  const invalidate = useInvalidate();
  const { mutateAsync: customMutation } = useCustomMutation();

  // Dialog state for scheduling meetings
  const [pendingMeeting, setPendingMeeting] = useState<{
    item: KanbanItem;
    targetColumn: ColumnKey;
  } | null>(null);
  const [meetingError, setMeetingError] = useState<string | null>(null);

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

  // Lead→Opportunity conversion happens when moving from Meeting to Quoted
  const conversionStatusMap: Partial<Record<ColumnKey, string>> = {
    quoted: "Quotation",
  };

  const handleConvertLead = useCallback(
    async (item: KanbanItem, targetColumnKey: ColumnKey) => {
      const oppStatus = conversionStatusMap[targetColumnKey];
      if (!oppStatus) {
        throw new Error(`Cannot convert Lead to column "${targetColumnKey}"`);
      }
      try {
        await customMutation({
          url: "/api/resource/Opportunity",
          method: "post",
          values: {
            opportunity_from: "Lead",
            party_name: getDocName(item),
            status: oppStatus,
          },
        });
        invalidate({ resource: "Lead", invalidates: ["list"] });
        invalidate({ resource: "Opportunity", invalidates: ["list"] });
      } catch (err) {
        throw new Error(
          extractErrorMessage(err, `Failed to convert ${item.displayName} to Opportunity`)
        );
      }
    },
    [customMutation, invalidate]
  );

  const handleUpdateStatus = useCallback(
    async (item: KanbanItem, newStatus: string, targetColumn: string) => {
      // Prevent new drops while meeting dialog is open (race condition fix)
      if (pendingMeeting) return;

      // Intercept drops to "meeting" column — show dialog instead
      if (targetColumn === "meeting" && item.doctype === "Lead") {
        setMeetingError(null);
        setPendingMeeting({ item, targetColumn: targetColumn as ColumnKey });
        return;
      }

      try {
        await customMutation({
          url: "/api/method/frappe.client.set_value",
          method: "post",
          values: {
            doctype: item.doctype,
            name: getDocName(item),
            fieldname: "status",
            value: newStatus,
          },
        });
        // Refetch both lists to sync server state
        invalidate({ resource: "Lead", invalidates: ["list"] });
        invalidate({ resource: "Opportunity", invalidates: ["list"] });
      } catch (err) {
        throw new Error(
          extractErrorMessage(err, `Failed to update ${item.doctype} status`)
        );
      }
    },
    [customMutation, invalidate, pendingMeeting]
  );

  const handleMeetingConfirm = useCallback(
    async (datetime: string, subject: string) => {
      if (!pendingMeeting) return;
      const { item } = pendingMeeting;

      try {
        // Create Event with Event Participants linking to Lead
        // Parse datetime and add 1 hour for ends_on (handles day rollover correctly)
        const startsOn = datetime.replace("T", " ") + ":00";
        const startDate = new Date(datetime);
        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // Add 1 hour
        // Format as "YYYY-MM-DD HH:MM:SS" in local time
        const endsOn = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")} ${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}:00`;

        await customMutation({
          url: "/api/resource/Event",
          method: "post",
          values: {
            subject,
            starts_on: startsOn,
            ends_on: endsOn,
            event_category: "Meeting",
            event_type: "Private",
            event_participants: [
              {
                reference_doctype: "Lead",
                reference_docname: getDocName(item),
              },
            ],
          },
        });

        // Update Lead status to "Interested" (maps to Meeting column)
        await customMutation({
          url: "/api/method/frappe.client.set_value",
          method: "post",
          values: {
            doctype: "Lead",
            name: getDocName(item),
            fieldname: "status",
            value: "Interested",
          },
        });

        invalidate({ resource: "Lead", invalidates: ["list"] });
        invalidate({ resource: "Event", invalidates: ["list"] });
        setPendingMeeting(null);
      } catch (err) {
        setMeetingError(extractErrorMessage(err, "Failed to schedule meeting"));
      }
    },
    [pendingMeeting, customMutation, invalidate]
  );

  const handleMeetingCancel = useCallback(() => {
    setPendingMeeting(null);
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">CRM Kanban</h1>
        <p className="text-muted-foreground">Drag and drop to update lead and opportunity status</p>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border-2 border-muted p-3 space-y-3 min-h-[300px]">
              <Skeleton className="h-5 w-[80px]" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <KanbanBoard items={items} onUpdateStatus={handleUpdateStatus} onConvertLead={handleConvertLead} />
          <ul className="mt-6 space-y-1 text-xs text-muted-foreground list-disc list-inside">
            <li><span className="font-medium text-foreground">New</span> — Fresh inquiry, not yet contacted. <span className="font-medium">Lead</span>.</li>
            <li><span className="font-medium text-foreground">Engaged</span> — In conversation, follow-up started. <span className="font-medium">Lead</span>.</li>
            <li><span className="font-medium text-foreground">Meeting</span> — Meeting scheduled to discuss requirements. <span className="font-medium">Lead</span>.</li>
            <li><span className="font-medium text-foreground">Quoted</span> — Quote sent after successful meeting. <span className="font-medium">Opportunity</span>.</li>
            <li><span className="font-medium text-foreground">Won</span> — Booked, deal closed. <span className="font-medium">Opportunity</span>.</li>
            <li><span className="font-medium text-foreground">Lost</span> — Did not proceed. <span className="font-medium">Lead</span> or <span className="font-medium">Opportunity</span>.</li>
          </ul>
        </>
      )}
      <MeetingScheduleDialog
        open={!!pendingMeeting}
        onOpenChange={(open) => !open && handleMeetingCancel()}
        itemName={pendingMeeting?.item.displayName ?? ""}
        onConfirm={handleMeetingConfirm}
        onCancel={handleMeetingCancel}
        error={meetingError}
        onErrorDismiss={() => setMeetingError(null)}
      />
    </div>
  );
}
