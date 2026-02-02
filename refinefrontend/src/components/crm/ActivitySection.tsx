import { useState, useMemo } from "react";
import { useList, useCreate, useInvalidate } from "@refinedev/core";
import DOMPurify from "dompurify";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { extractErrorMessage } from "@/lib/errors";

interface ActivityRef {
  doctype: string;
  docName: string;
}

interface ActivitySectionProps {
  references: ActivityRef[];
}

type ActivityItem = {
  type: "communication" | "comment";
  name: string;
  content: string;
  author: string;
  creation: string;
  subject?: string;
  medium?: string;
  direction?: "Sent" | "Received";
  sourceDoctype?: string;
  sourceDocName?: string;
};

function useActivityForRef(ref: ActivityRef) {
  const { result: commsResult } = useList({
    resource: "Communication",
    pagination: { pageSize: 50 },
    sorters: [{ field: "creation", order: "desc" }],
    filters: [
      { field: "reference_doctype", operator: "eq", value: ref.doctype },
      { field: "reference_name", operator: "eq", value: ref.docName },
    ],
    meta: { fields: ["name", "subject", "content", "communication_medium", "sender", "recipients", "communication_date", "creation", "sent_or_received"] },
  });

  const { result: commentsResult } = useList({
    resource: "Comment",
    pagination: { pageSize: 50 },
    sorters: [{ field: "creation", order: "desc" }],
    filters: [
      { field: "reference_doctype", operator: "eq", value: ref.doctype },
      { field: "reference_name", operator: "eq", value: ref.docName },
      { field: "comment_type", operator: "eq", value: "Comment" },
    ],
    meta: { fields: ["name", "content", "comment_email", "creation"] },
  });

  return { commsResult, commentsResult };
}

function ActivityFeed({ references }: ActivitySectionProps) {
  // Fetch activity for up to 2 references (primary + source lead)
  const ref0 = references[0];
  const ref1 = references.length > 1 ? references[1] : null;

  const { commsResult: comms0, commentsResult: comments0 } = useActivityForRef(ref0);
  const { commsResult: comms1, commentsResult: comments1 } = useActivityForRef(
    ref1 ?? { doctype: "__none__", docName: "__none__" }
  );

  const activityItems = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];

    function addComms(result: any, ref: ActivityRef) {
      for (const c of (result?.data ?? []) as any[]) {
        items.push({
          type: "communication", name: c.name, content: c.content ?? "",
          author: c.sender ?? "", creation: c.creation,
          subject: c.subject ?? undefined, medium: c.communication_medium ?? "Other",
          direction: c.sent_or_received === "Sent" ? "Sent" : c.sent_or_received === "Received" ? "Received" : undefined,
          sourceDoctype: ref.doctype, sourceDocName: ref.docName,
        });
      }
    }

    function addComments(result: any, ref: ActivityRef) {
      for (const c of (result?.data ?? []) as any[]) {
        items.push({
          type: "comment", name: c.name, content: c.content ?? "",
          author: c.comment_email ?? "", creation: c.creation,
          sourceDoctype: ref.doctype, sourceDocName: ref.docName,
        });
      }
    }

    addComms(comms0, ref0);
    addComments(comments0, ref0);
    if (ref1) {
      addComms(comms1, ref1);
      addComments(comments1, ref1);
    }

    items.sort((a, b) => new Date(b.creation).getTime() - new Date(a.creation).getTime());
    return items;
  }, [comms0, comments0, comms1, comments1, ref0, ref1]);

  if (activityItems.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No activity yet. Add a comment to start the conversation.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {activityItems.map((item) => {
        const isSent = item.type === "communication" && item.direction === "Sent";
        const isReceived = item.type === "communication" && item.direction === "Received";
        const isComment = item.type === "comment";

        const containerClass = isSent
          ? "bg-blue-50 dark:bg-blue-950/30 border-l-2 border-blue-400 rounded-r-md p-3"
          : isReceived
          ? "bg-green-50 dark:bg-green-950/30 border-l-2 border-green-400 rounded-r-md p-3"
          : "bg-muted/30 border-l-2 border-muted rounded-r-md p-3";

        const directionLabel = isSent
          ? <span className="text-blue-600 dark:text-blue-400 font-medium">&rarr; Sent</span>
          : isReceived
          ? <span className="text-green-600 dark:text-green-400 font-medium">&larr; Received</span>
          : isComment
          ? <span className="text-muted-foreground font-medium">Comment</span>
          : <span className="text-muted-foreground font-medium">Communication</span>;

        // Show source badge if activity comes from a different doctype than the primary
        const isFromOtherDoc = item.sourceDoctype !== ref0.doctype;

        return (
          <div key={`${item.type}-${item.name}`} className={containerClass}>
            <div className="flex items-center gap-2 text-sm flex-wrap">
              {directionLabel}
              {isFromOtherDoc && (
                <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                  from {item.sourceDoctype}
                </span>
              )}
              <span className="text-muted-foreground">&middot;</span>
              <span className="text-muted-foreground">{item.author}</span>
              <span className="text-muted-foreground ml-auto text-xs">{formatDate(item.creation)}</span>
            </div>
            {item.subject && <p className="text-sm font-medium mt-1">{item.subject}</p>}
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

export function ActivitySection({ references }: ActivitySectionProps) {
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const { mutateAsync: createDoc } = useCreate();
  const invalidate = useInvalidate();

  const primaryRef = references[0];

  async function handleAddComment() {
    if (!commentText.trim()) return;
    setSubmittingComment(true);
    try {
      await createDoc({
        resource: "Comment",
        values: {
          comment_type: "Comment",
          reference_doctype: primaryRef.doctype,
          reference_name: primaryRef.docName,
          content: commentText.trim(),
        },
      });
      setCommentText("");
      invalidate({ resource: "Comment", invalidates: ["list"] });
      invalidate({ resource: "Communication", invalidates: ["list"] });
    } catch (err) {
      console.error("Failed to add comment:", err);
      alert(extractErrorMessage(err, "Failed to add comment. Please try again."));
    } finally {
      setSubmittingComment(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Textarea
            placeholder="Add a comment..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={handleAddComment} disabled={submittingComment || !commentText.trim()}>
              {submittingComment ? "Adding..." : "Add Comment"}
            </Button>
          </div>
        </div>

        <Separator />

        <ActivityFeed references={references} />
      </CardContent>
    </Card>
  );
}
