import { useMemo } from "react";
import { useList } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";
import { commStamp, type Communication } from "@/components/chats/useChatData";

export interface ConversationRef {
  doctype: string;
  docName: string;
}

// Fetch Communications linked via timeline_links (child table)
function useTimelineLinkedConversations(ref: ConversationRef) {
  return useQuery({
    queryKey: ["timeline-communications", ref.doctype, ref.docName],
    queryFn: async () => {
      if (!ref.docName || ref.docName === "__none__") return [];
      const params = new URLSearchParams({
        doctype: "Communication",
        fields: JSON.stringify([
          "name", "subject", "content", "communication_medium",
          "sender", "creation", "sent_or_received", "communication_date",
        ]),
        filters: JSON.stringify([
          ["Communication Link", "link_doctype", "=", ref.doctype],
          ["Communication Link", "link_name", "=", ref.docName],
        ]),
        order_by: "creation desc",
        limit_page_length: "50",
      });
      const res = await fetch(`/api/method/frappe.client.get_list?${params}`, {
        credentials: "include",
        headers: { "X-Frappe-Site-Name": "erp.merakiwp.com" },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.message ?? []) as Array<{
        name: string;
        subject?: string;
        content: string;
        communication_medium: string;
        sender: string;
        creation: string;
        sent_or_received: string;
        communication_date?: string;
      }>;
    },
    enabled: !!ref.docName && ref.docName !== "__none__",
  });
}

// Also keep direct reference query for completeness
function useConversationsForRef(ref: ConversationRef) {
  return useList({
    resource: "Communication",
    pagination: { pageSize: 50 },
    sorters: [{ field: "creation", order: "desc" }],
    filters: [
      { field: "reference_doctype", operator: "eq", value: ref.doctype },
      { field: "reference_name", operator: "eq", value: ref.docName },
      { field: "communication_type", operator: "eq", value: "Communication" },
    ],
    meta: {
      fields: [
        "name", "subject", "content", "communication_medium",
        "sender", "creation", "sent_or_received", "communication_date",
      ],
    },
  });
}

/** Every Communication on the given records (direct reference and timeline links), oldest first. */
export function useConversationItems(references: ConversationRef[]): Communication[] {
  const ref0 = references[0];
  const ref1 = references.length > 1 ? references[1] : null;

  // Direct reference queries
  const { result: result0 } = useConversationsForRef(ref0);
  const { result: result1 } = useConversationsForRef(
    ref1 ?? { doctype: "__none__", docName: "__none__" },
  );

  // Timeline links queries
  const { data: timelineComms0 = [] } = useTimelineLinkedConversations(ref0);
  const { data: timelineComms1 = [] } = useTimelineLinkedConversations(
    ref1 ?? { doctype: "__none__", docName: "__none__" },
  );

  const items = useMemo<Communication[]>(() => {
    const all: Communication[] = [];
    const seen = new Set<string>();

    function addItem(c: any) {
      if (seen.has(c.name)) return;
      seen.add(c.name);
      all.push({
        name: c.name,
        content: c.content ?? "",
        subject: c.subject || undefined,
        communication_medium: c.communication_medium ?? "Other",
        sender: c.sender ?? "",
        creation: c.creation,
        communication_date: c.communication_date,
        sent_or_received: c.sent_or_received === "Sent" ? "Sent" : "Received",
      });
    }

    // Add from direct reference results
    for (const c of ((result0 as any)?.data ?? [])) addItem(c);
    if (ref1) {
      for (const c of ((result1 as any)?.data ?? [])) addItem(c);
    }

    // Add from timeline links results
    for (const c of timelineComms0) addItem(c);
    for (const c of timelineComms1) addItem(c);

    // Oldest first, so the thread reads top to bottom like the Chats page.
    all.sort((a, b) => new Date(commStamp(a)).getTime() - new Date(commStamp(b)).getTime());
    return all;
  }, [result0, result1, ref1, timelineComms0, timelineComms1]);
  return items;
}
