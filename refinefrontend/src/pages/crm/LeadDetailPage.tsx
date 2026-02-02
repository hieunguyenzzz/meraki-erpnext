import { useState, useMemo } from "react";
import { useParams } from "react-router";
import { useOne, useList, useCreate, useCustomMutation, useInvalidate } from "@refinedev/core";
import DOMPurify from "dompurify";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { extractErrorMessage } from "@/lib/errors";
import { DetailSkeleton } from "@/components/detail-skeleton";

const LEAD_STATUSES = ["Lead", "Open", "Replied", "Opportunity", "Quotation", "Lost Quotation", "Interested", "Converted", "Do Not Contact"];

function statusVariant(status: string) {
  switch (status) {
    case "Lead": return "info" as const;
    case "Open": return "warning" as const;
    case "Replied": case "Interested": case "Converted": case "Opportunity": case "Quotation": return "success" as const;
    case "Lost Quotation": case "Do Not Contact": return "destructive" as const;
    default: return "secondary" as const;
  }
}

export default function LeadDetailPage() {
  const { name } = useParams<{ name: string }>();
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  const invalidate = useInvalidate();
  const { result: lead } = useOne({ resource: "Lead", id: name! });

  const { mutateAsync: createDoc } = useCreate();
  const { mutateAsync: customMutation } = useCustomMutation();

  const { result: commsResult } = useList({
    resource: "Communication",
    pagination: { pageSize: 50 },
    sorters: [{ field: "creation", order: "desc" }],
    filters: [
      { field: "reference_doctype", operator: "eq", value: "Lead" },
      { field: "reference_name", operator: "eq", value: name! },
    ],
    meta: { fields: ["name", "subject", "content", "communication_medium", "sender", "recipients", "communication_date", "creation", "sent_or_received"] },
  });

  const { result: commentsResult } = useList({
    resource: "Comment",
    pagination: { pageSize: 50 },
    sorters: [{ field: "creation", order: "desc" }],
    filters: [
      { field: "reference_doctype", operator: "eq", value: "Lead" },
      { field: "reference_name", operator: "eq", value: name! },
      { field: "comment_type", operator: "eq", value: "Comment" },
    ],
    meta: { fields: ["name", "content", "comment_email", "creation"] },
  });

  type ActivityItem = {
    type: "communication" | "comment";
    name: string;
    content: string;
    author: string;
    creation: string;
    subject?: string;
    medium?: string;
    direction?: "Sent" | "Received";
  };

  const activityItems = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];
    for (const c of (commsResult?.data ?? []) as any[]) {
      items.push({
        type: "communication", name: c.name, content: c.content ?? "",
        author: c.sender ?? "", creation: c.creation,
        subject: c.subject ?? undefined, medium: c.communication_medium ?? "Other",
        direction: c.sent_or_received === "Sent" ? "Sent" : c.sent_or_received === "Received" ? "Received" : undefined,
      });
    }
    for (const c of (commentsResult?.data ?? []) as any[]) {
      items.push({
        type: "comment", name: c.name, content: c.content ?? "",
        author: c.comment_email ?? "", creation: c.creation,
      });
    }
    items.sort((a, b) => new Date(b.creation).getTime() - new Date(a.creation).getTime());
    return items;
  }, [commsResult, commentsResult]);

  async function handleAddComment() {
    if (!commentText.trim() || !lead) return;
    setSubmittingComment(true);
    try {
      await createDoc({
        resource: "Comment",
        values: {
          comment_type: "Comment",
          reference_doctype: "Lead",
          reference_name: lead.name,
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

  async function handleStatusChange(newStatus: string) {
    if (!lead || newStatus === lead.status) return;
    setUpdatingStatus(true);
    try {
      await customMutation({
        url: "/api/method/frappe.client.set_value",
        method: "post",
        values: { doctype: "Lead", name: lead.name, fieldname: "status", value: newStatus },
      });
      invalidate({ resource: "Lead", invalidates: ["detail"], id: name! });
    } catch (err) {
      console.error("Failed to update status:", err);
      alert(extractErrorMessage(err, "Failed to update status. Please try again."));
    } finally {
      setUpdatingStatus(false);
    }
  }

  if (!lead) {
    return <DetailSkeleton />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{lead.lead_name}</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lead Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">ID</span>
              <span>{lead.name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Status</span>
              <div className="flex items-center gap-2">
                <Badge variant={statusVariant(lead.status)}>{lead.status}</Badge>
                <Select value={lead.status} onValueChange={handleStatusChange} disabled={updatingStatus}>
                  <SelectTrigger className="w-[160px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span>{lead.email_id || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone</span>
              <span>{lead.phone || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Source</span>
              <span>{lead.source || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Company</span>
              <span>{lead.company_name || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{formatDate(lead.creation)}</span>
            </div>
          </CardContent>
        </Card>

        {lead.notes && (
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{lead.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>

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

          {activityItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No activity yet. Add a comment to start the conversation.
            </p>
          ) : (
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

                return (
                  <div key={`${item.type}-${item.name}`} className={containerClass}>
                    <div className="flex items-center gap-2 text-sm flex-wrap">
                      {directionLabel}
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
