import { useState, useMemo } from "react";
import { useList, useCreate, useInvalidate } from "@refinedev/core";
import DOMPurify from "dompurify";
import {
  Phone, MessageSquare, Mail, Users, MoreHorizontal,
  ArrowRight, ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { extractErrorMessage } from "@/lib/errors";

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

type ConversationItem = {
  name: string;
  content: string;
  subject?: string;
  medium: string;
  direction: "Sent" | "Received";
  author: string;
  creation: string;
};

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
        "sender", "creation", "sent_or_received",
      ],
    },
  });
}

function ConversationFeed({ references }: ConversationSectionProps) {
  const ref0 = references[0];
  const ref1 = references.length > 1 ? references[1] : null;

  const { result: result0 } = useConversationsForRef(ref0);
  const { result: result1 } = useConversationsForRef(
    ref1 ?? { doctype: "__none__", docName: "__none__" },
  );

  const items = useMemo<ConversationItem[]>(() => {
    const all: ConversationItem[] = [];

    function addFromResult(result: any) {
      for (const c of (result?.data ?? []) as any[]) {
        all.push({
          name: c.name,
          content: c.content ?? "",
          subject: c.subject || undefined,
          medium: c.communication_medium ?? "Other",
          direction: c.sent_or_received === "Sent" ? "Sent" : "Received",
          author: c.sender ?? "",
          creation: c.creation,
        });
      }
    }

    addFromResult(result0);
    if (ref1) addFromResult(result1);

    all.sort((a, b) => new Date(b.creation).getTime() - new Date(a.creation).getTime());
    return all;
  }, [result0, result1, ref1]);

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
        const isSent = item.direction === "Sent";
        const MediumIcon = MEDIUM_ICONS[item.medium as Medium] ?? MoreHorizontal;

        return (
          <div
            key={item.name}
            className={cn(
              "rounded-r-md p-3 border-l-2",
              isSent
                ? "bg-blue-50 dark:bg-blue-950/30 border-blue-400"
                : "bg-green-50 dark:bg-green-950/30 border-green-400",
            )}
          >
            <div className="flex items-center gap-2 text-sm flex-wrap">
              {isSent ? (
                <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                  <ArrowRight className="h-3.5 w-3.5" /> Sent
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
                  <ArrowLeft className="h-3.5 w-3.5" /> Received
                </span>
              )}
              <span className="text-muted-foreground">&middot;</span>
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <MediumIcon className="h-3.5 w-3.5" /> {item.medium}
              </span>
              <span className="text-muted-foreground ml-auto text-xs">
                {formatDate(item.creation)}
              </span>
            </div>
            {item.subject && (
              <p className="text-sm font-medium mt-1">{item.subject}</p>
            )}
            <div
              className="text-sm text-muted-foreground prose prose-sm max-w-none mt-1"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.content) }}
            />
          </div>
        );
      })}
    </div>
  );
}

export function ConversationSection({ references }: ConversationSectionProps) {
  const [direction, setDirection] = useState<"Sent" | "Received">("Received");
  const [medium, setMedium] = useState<Medium>("Phone");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { mutateAsync: createDoc } = useCreate();
  const invalidate = useInvalidate();
  const primaryRef = references[0];

  async function handleLog() {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      await createDoc({
        resource: "Communication",
        values: {
          communication_type: "Communication",
          communication_medium: medium,
          sent_or_received: direction,
          subject: subject.trim() || undefined,
          content: `<p>${content.trim().replace(/\n/g, "<br>")}</p>`,
          send_email: 0,
          reference_doctype: primaryRef.doctype,
          reference_name: primaryRef.docName,
        },
      });
      setSubject("");
      setContent("");
      invalidate({ resource: "Communication", invalidates: ["list"] });
    } catch (err) {
      console.error("Failed to log conversation:", err);
      alert(extractErrorMessage(err, "Failed to log conversation."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Form */}
        <div className="space-y-3">
          {/* Direction toggle */}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={direction === "Sent" ? "default" : "outline"}
              onClick={() => setDirection("Sent")}
            >
              <ArrowRight className="h-3.5 w-3.5 mr-1" /> We sent
            </Button>
            <Button
              type="button"
              size="sm"
              variant={direction === "Received" ? "default" : "outline"}
              onClick={() => setDirection("Received")}
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Client sent
            </Button>
          </div>

          {/* Medium selector */}
          <Select value={medium} onValueChange={(v) => setMedium(v as Medium)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(MEDIUM_ICONS) as Medium[]).map((m) => {
                const Icon = MEDIUM_ICONS[m];
                return (
                  <SelectItem key={m} value={m}>
                    <span className="inline-flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5" /> {m}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {/* Subject (optional) */}
          <Input
            placeholder="Subject (optional)"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />

          {/* Content */}
          <Textarea
            placeholder="What was discussed..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
          />

          <div className="flex justify-end">
            <Button size="sm" onClick={handleLog} disabled={submitting || !content.trim()}>
              {submitting ? "Logging..." : "Log Conversation"}
            </Button>
          </div>
        </div>

        <Separator />

        {/* Feed */}
        <ConversationFeed references={references} />
      </CardContent>
    </Card>
  );
}
