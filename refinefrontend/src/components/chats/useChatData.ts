import { useMemo } from "react";
import { useList } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";

export interface ChatLead {
  name: string;
  lead_name: string;
  email_id?: string;
  status: string;
  creation: string;
  custom_wedding_date?: string;
  custom_wedding_date_raw?: string;
}

export interface Communication {
  name: string;
  subject?: string;
  content: string;
  communication_medium: string;
  sender: string;
  creation: string;
  sent_or_received: "Sent" | "Received";
  communication_date?: string;
  reference_doctype: string;
  reference_name: string;
}

export interface ChatSummary extends ChatLead {
  lastComm: Communication;
  commCount: number;
}

export const commStamp = (c: Communication) => c.communication_date || c.creation;

async function fetchComms(fields: string[], filters: unknown[], orderBy: string, limit: string) {
  const params = new URLSearchParams({
    doctype: "Communication",
    fields: JSON.stringify(fields),
    filters: JSON.stringify(filters),
    order_by: orderBy,
    limit_page_length: limit,
  });
  const res = await fetch(`/api/method/frappe.client.get_list?${params}`, {
    credentials: "include",
    headers: { "X-Frappe-Site-Name": "erp.merakiwp.com" },
  });
  if (!res.ok) throw new Error(`Communication list failed (${res.status})`);
  const data = await res.json();
  return (data.message ?? []) as Communication[];
}

const BASE_FIELDS = [
  "name", "subject", "content", "communication_medium",
  "sender", "creation", "sent_or_received", "communication_date",
];

/** Every lead communication (for last message per lead) merged with the leads, newest first. */
export function useChatSummaries() {
  const { result, query: leadsQuery } = useList({
    resource: "Lead",
    pagination: { pageSize: 500 },
    sorters: [{ field: "creation", order: "desc" }],
    filters: [{ field: "status", operator: "nin", value: ["Do Not Contact"] }],
    meta: {
      fields: [
        "name", "lead_name", "email_id", "status", "creation",
        "custom_wedding_date", "custom_wedding_date_raw",
      ],
    },
  });

  const commsQuery = useQuery({
    queryKey: ["all-lead-communications"],
    queryFn: () =>
      fetchComms(
        [...BASE_FIELDS, "reference_doctype", "reference_name"],
        [["reference_doctype", "=", "Lead"], ["communication_type", "=", "Communication"]],
        "communication_date desc, creation desc",
        "500",
      ),
  });

  const chats = useMemo<ChatSummary[]>(() => {
    const leads = (result?.data ?? []) as ChatLead[];
    const byLead = new Map<string, Communication[]>();
    for (const c of commsQuery.data ?? []) {
      const list = byLead.get(c.reference_name) ?? [];
      list.push(c);
      byLead.set(c.reference_name, list);
    }
    const out: ChatSummary[] = [];
    for (const lead of leads) {
      const comms = byLead.get(lead.name);
      if (!comms?.length) continue; // only leads with conversations
      const last = comms.reduce((a, b) => (commStamp(b) > commStamp(a) ? b : a));
      out.push({ ...lead, lastComm: last, commCount: comms.length });
    }
    out.sort((a, b) => (commStamp(b.lastComm) > commStamp(a.lastComm) ? 1 : -1));
    return out;
  }, [result, commsQuery.data]);

  return {
    chats,
    isLoading: leadsQuery.isLoading || commsQuery.isLoading,
    isError: leadsQuery.isError || commsQuery.isError,
    refetch: () => {
      leadsQuery.refetch();
      commsQuery.refetch();
    },
  };
}

/** Full thread for one lead, oldest first. */
export function useLeadConversation(leadName: string) {
  return useQuery({
    queryKey: ["lead-conversation", leadName],
    enabled: !!leadName,
    queryFn: () =>
      fetchComms(
        BASE_FIELDS,
        [
          ["reference_doctype", "=", "Lead"],
          ["reference_name", "=", leadName],
          ["communication_type", "=", "Communication"],
        ],
        "communication_date asc, creation asc",
        "100",
      ),
  });
}
