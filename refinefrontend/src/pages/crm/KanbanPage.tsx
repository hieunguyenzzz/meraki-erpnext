import { useMemo, useCallback } from "react";
import { useList, useCustomMutation, useInvalidate } from "@refinedev/core";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { buildKanbanItems, enrichWithActivity, getDocName, type KanbanItem, type ColumnKey } from "@/lib/kanban";
import { extractErrorMessage } from "@/lib/errors";
import { Skeleton } from "@/components/ui/skeleton";

export default function KanbanPage() {
  const invalidate = useInvalidate();
  const { mutateAsync: customMutation } = useCustomMutation();

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

  const items = useMemo(() => {
    const base = buildKanbanItems(leadsResult?.data ?? [], oppsResult?.data ?? []);
    return enrichWithActivity(base, commsResult?.data ?? []);
  }, [leadsResult, oppsResult, commsResult]);

  const isLoading = leadsQuery?.isLoading || oppsQuery?.isLoading || commsQuery?.isLoading;

  // Map Opportunity-only columns to Opportunity status for Lead conversion
  const conversionStatusMap: Partial<Record<ColumnKey, string>> = {
    qualified: "Open",
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
    async (item: KanbanItem, newStatus: string) => {
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
    [customMutation, invalidate]
  );

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
            <li><span className="font-medium text-foreground">New</span> — Fresh inquiry, not yet contacted. Appears as a <span className="font-medium">Lead</span>.</li>
            <li><span className="font-medium text-foreground">Engaged</span> — In conversation, follow-up started. Still a <span className="font-medium">Lead</span>.</li>
            <li><span className="font-medium text-foreground">Qualified</span> — Converted to <span className="font-medium">Opportunity</span>, ready for proposal.</li>
            <li><span className="font-medium text-foreground">Quoted</span> — Price sent, awaiting client decision. <span className="font-medium">Opportunity</span>.</li>
            <li><span className="font-medium text-foreground">Won</span> — Booked, deal closed. <span className="font-medium">Opportunity</span>.</li>
            <li><span className="font-medium text-foreground">Lost</span> — Did not proceed. Can be a <span className="font-medium">Lead</span> or <span className="font-medium">Opportunity</span>.</li>
          </ul>
        </>
      )}
    </div>
  );
}
