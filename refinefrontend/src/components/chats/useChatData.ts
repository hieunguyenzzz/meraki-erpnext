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
}

/** One inbox row, built by GET /inquiry-api/chats/summaries (plain-text preview, no HTML). */
export interface ChatSummary extends ChatLead {
  message_count: number;
  last_at: string;
  last_direction: "Sent" | "Received" | null;
  last_preview: string;
}

export const commStamp = (c: Communication) => c.communication_date || c.creation;

/** Every lead that has conversations, newest first; the backend does the grouping. */
export function useChatSummaries() {
  const query = useQuery({
    queryKey: ["chat-summaries"],
    queryFn: async () => {
      const res = await fetch("/inquiry-api/chats/summaries", { credentials: "include" });
      if (!res.ok) throw new Error(`Chat summaries failed (${res.status})`);
      return ((await res.json()).data ?? []) as ChatSummary[];
    },
  });

  return {
    chats: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => query.refetch(),
  };
}

const THREAD_LIMIT = 100;

/** The latest THREAD_LIMIT messages of one lead, oldest first. */
export function useLeadConversation(leadName: string) {
  return useQuery({
    queryKey: ["lead-conversation", leadName],
    enabled: !!leadName,
    queryFn: async () => {
      const params = new URLSearchParams({
        doctype: "Communication",
        fields: JSON.stringify([
          "name", "subject", "content", "communication_medium",
          "sender", "creation", "sent_or_received", "communication_date",
        ]),
        filters: JSON.stringify([
          ["reference_doctype", "=", "Lead"],
          ["reference_name", "=", leadName],
          ["communication_type", "=", "Communication"],
        ]),
        // Newest first so a long thread keeps its recent messages; flipped for reading.
        order_by: "communication_date desc, creation desc",
        limit_page_length: String(THREAD_LIMIT),
      });
      const res = await fetch(`/api/method/frappe.client.get_list?${params}`, {
        credentials: "include",
        headers: { "X-Frappe-Site-Name": "erp.merakiwp.com" },
      });
      if (!res.ok) throw new Error(`Communication list failed (${res.status})`);
      const data = await res.json();
      return ((data.message ?? []) as Communication[]).reverse();
    },
  });
}
