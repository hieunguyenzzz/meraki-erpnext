import { useMemo } from "react";
import { useList } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";

export interface NoteRef {
  doctype: string;
  docName: string;
}

export type ActivityItem = {
  id: string;
  type: "email_sent" | "email_received" | "stage_change" | "note";
  content: string;
  author: string;
  creation: string;
  subject?: string;
};

function useCommentsForRef(ref: NoteRef, commentTypes: string[]) {
  return useList({
    resource: "Comment",
    pagination: { pageSize: 50 },
    sorters: [{ field: "creation", order: "desc" }],
    filters: [
      { field: "reference_doctype", operator: "eq", value: ref.doctype },
      { field: "reference_name", operator: "eq", value: ref.docName },
      { field: "comment_type", operator: "in", value: commentTypes },
    ],
    meta: { fields: ["name", "content", "comment_email", "comment_type", "creation"] },
  });
}

function useCommunicationsForRef(ref: NoteRef) {
  return useList({
    resource: "Communication",
    pagination: { pageSize: 50 },
    sorters: [{ field: "creation", order: "desc" }],
    filters: [
      { field: "reference_doctype", operator: "eq", value: ref.doctype },
      { field: "reference_name", operator: "eq", value: ref.docName },
      { field: "communication_type", operator: "eq", value: "Communication" },
    ],
    meta: { fields: ["name", "content", "sender", "sent_or_received", "subject", "creation"] },
  });
}

// Fetch Communications linked via timeline_links (child table)
function useTimelineLinkedCommunications(ref: NoteRef) {
  return useQuery({
    queryKey: ["timeline-communications-activity", ref.doctype, ref.docName],
    queryFn: async () => {
      if (!ref.docName || ref.docName === "__none__") return [];
      const params = new URLSearchParams({
        doctype: "Communication",
        fields: JSON.stringify(["name", "content", "sender", "sent_or_received", "subject", "creation"]),
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
        content: string;
        sender: string;
        sent_or_received: string;
        subject?: string;
        creation: string;
      }>;
    },
    enabled: !!ref.docName && ref.docName !== "__none__",
  });
}

/** Comments, notes and emails on the given records, newest first. */
export function useActivityItems(references: NoteRef[]): ActivityItem[] {
  const ref0 = references[0];
  const ref1 = references.length > 1 ? references[1] : null;

  // Fetch Comments (both Comment and Info types)
  const { result: comments0 } = useCommentsForRef(ref0, ["Comment", "Info"]);
  const { result: comments1 } = useCommentsForRef(
    ref1 ?? { doctype: "__none__", docName: "__none__" },
    ["Comment", "Info"],
  );

  // Fetch Communications (emails) - direct reference
  const { result: comms0 } = useCommunicationsForRef(ref0);
  const { result: comms1 } = useCommunicationsForRef(
    ref1 ?? { doctype: "__none__", docName: "__none__" },
  );

  // Fetch Communications via timeline_links
  const { data: timelineComms0 = [] } = useTimelineLinkedCommunications(ref0);
  const { data: timelineComms1 = [] } = useTimelineLinkedCommunications(
    ref1 ?? { doctype: "__none__", docName: "__none__" },
  );

  const items = useMemo<ActivityItem[]>(() => {
    const all: ActivityItem[] = [];
    const seen = new Set<string>();

    function addComment(c: any) {
      if (seen.has(c.name)) return;
      seen.add(c.name);

      const commentType = c.comment_type;
      let type: ActivityItem["type"] = "note";
      if (commentType === "Info") {
        type = "stage_change";
      }

      all.push({
        id: c.name,
        type,
        content: c.content ?? "",
        author: c.comment_email ?? "",
        creation: c.creation,
      });
    }

    function addCommunication(comm: any) {
      if (seen.has(comm.name)) return;
      seen.add(comm.name);

      const type: ActivityItem["type"] = comm.sent_or_received === "Sent" ? "email_sent" : "email_received";

      all.push({
        id: comm.name,
        type,
        content: comm.content ?? "",
        author: comm.sender ?? "",
        creation: comm.creation,
        subject: comm.subject,
      });
    }

    // Add comments from both refs
    for (const c of ((comments0 as any)?.data ?? [])) addComment(c);
    if (ref1) {
      for (const c of ((comments1 as any)?.data ?? [])) addComment(c);
    }

    // Add communications from both refs (direct reference)
    for (const comm of ((comms0 as any)?.data ?? [])) addCommunication(comm);
    if (ref1) {
      for (const comm of ((comms1 as any)?.data ?? [])) addCommunication(comm);
    }

    // Add communications from timeline_links
    for (const comm of timelineComms0) addCommunication(comm);
    for (const comm of timelineComms1) addCommunication(comm);

    // Sort by creation date (newest first)
    all.sort((a, b) => new Date(b.creation).getTime() - new Date(a.creation).getTime());
    return all;
  }, [comments0, comments1, comms0, comms1, ref1, timelineComms0, timelineComms1]);
  return items;
}
