import { useState, useMemo } from "react";
import { useList } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import {
  Phone, MessageSquare, Mail, Users, MoreHorizontal,
  ChevronDown, ChevronUp, ArrowUpRight, ArrowDownLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ConversationRef {
  doctype: string;
  docName: string;
}

interface ConversationSectionProps {
  references: ConversationRef[];
}

type Medium = "Phone" | "WhatsApp" | "Email" | "Meeting" | "Other";

const MEDIUM_ICONS: Record<Medium, typeof Phone> = {
  Phone, WhatsApp: MessageSquare, Email: Mail, Meeting: Users, Other: MoreHorizontal,
};

// Helper to strip HTML tags and get plain text for preview
function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent || "";
}

const PREVIEW_LENGTH = 150;

type ConversationItem = {
  name: string;
  content: string;
  subject?: string;
  medium: string;
  author: string;
  creation: string;
  communication_date?: string;
  sent_or_received?: "Sent" | "Received";
};

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

function ConversationFeed({ references }: ConversationSectionProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
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

  function toggleExpanded(id: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const items = useMemo<ConversationItem[]>(() => {
    const all: ConversationItem[] = [];
    const seen = new Set<string>();

    function addItem(c: any) {
      if (seen.has(c.name)) return;
      seen.add(c.name);
      all.push({
        name: c.name,
        content: c.content ?? "",
        subject: c.subject || undefined,
        medium: c.communication_medium ?? "Other",
        author: c.sender ?? "",
        creation: c.creation,
        communication_date: c.communication_date,
        sent_or_received: c.sent_or_received as "Sent" | "Received" | undefined,
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

    all.sort((a, b) => {
      const dateA = new Date(a.communication_date || a.creation).getTime();
      const dateB = new Date(b.communication_date || b.creation).getTime();
      return dateB - dateA;
    });
    return all;
  }, [result0, result1, ref1, timelineComms0, timelineComms1]);

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No conversations logged yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const MediumIcon = MEDIUM_ICONS[item.medium as Medium] ?? MoreHorizontal;

        return (
          <div
            key={item.name}
            className="rounded-md p-3 border bg-muted/30"
          >
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <MediumIcon className="h-3.5 w-3.5" /> {item.medium}
              </span>
              {item.sent_or_received && (
                <span className={cn(
                  "inline-flex items-center gap-0.5 text-xs font-medium",
                  item.sent_or_received === "Sent"
                    ? "text-green-600 dark:text-green-400"
                    : "text-blue-600 dark:text-blue-400"
                )}>
                  {item.sent_or_received === "Sent" ? (
                    <><ArrowUpRight className="h-3 w-3" /> Sent</>
                  ) : (
                    <><ArrowDownLeft className="h-3 w-3" /> Received</>
                  )}
                </span>
              )}
              <span className="text-muted-foreground ml-auto text-xs">
                {formatDateTime(item.communication_date || item.creation)}
              </span>
            </div>
            {item.subject && (
              <p className="text-sm font-medium mt-1">{item.subject}</p>
            )}
            {(() => {
              const plainText = stripHtml(item.content);
              const needsTruncation = plainText.length > PREVIEW_LENGTH;
              const isExpanded = expandedItems.has(item.name);

              if (!needsTruncation) {
                return (
                  <div
                    className="text-sm prose prose-sm max-w-none mt-2"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.content) }}
                  />
                );
              }

              if (isExpanded) {
                return (
                  <div className="mt-2">
                    <div
                      className="text-sm prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.content) }}
                    />
                    <button
                      onClick={() => toggleExpanded(item.name)}
                      className="mt-2 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                      <ChevronUp className="h-3 w-3" />
                      Show less
                    </button>
                  </div>
                );
              }

              const preview = plainText.slice(0, PREVIEW_LENGTH).trim() + "...";
              return (
                <div className="mt-2">
                  <p className="text-sm text-muted-foreground">{preview}</p>
                  <button
                    onClick={() => toggleExpanded(item.name)}
                    className="mt-1 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    <ChevronDown className="h-3 w-3" />
                    Show more
                  </button>
                </div>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}

export function ConversationSection({ references }: ConversationSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversation</CardTitle>
      </CardHeader>
      <CardContent>
        <ConversationFeed references={references} />
      </CardContent>
    </Card>
  );
}
