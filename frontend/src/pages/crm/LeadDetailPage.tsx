import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useFrappeGetDoc, useFrappeGetDocList, useFrappeCreateDoc, useFrappePostCall } from "frappe-react-sdk";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const LEAD_STATUSES = ["Lead", "Open", "Replied", "Opportunity", "Quotation", "Lost Quotation", "Interested", "Converted", "Do Not Contact"];

function statusVariant(status: string) {
  switch (status) {
    case "Lead": return "info" as const;
    case "Open": return "warning" as const;
    case "Replied": case "Interested": return "success" as const;
    case "Converted": case "Opportunity": case "Quotation": return "success" as const;
    case "Lost Quotation": case "Do Not Contact": return "destructive" as const;
    default: return "secondary" as const;
  }
}

export default function LeadDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [converting, setConverting] = useState(false);

  const { data: lead, mutate } = useFrappeGetDoc("Lead", name ?? "");
  const { createDoc } = useFrappeCreateDoc();
  const { call: setValue } = useFrappePostCall("frappe.client.set_value");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Activity timeline data
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  const { data: communications, mutate: mutateCommunications } = useFrappeGetDocList("Communication", {
    fields: ["name", "subject", "content", "communication_medium", "sender", "recipients", "communication_date", "creation"],
    filters: [["reference_doctype", "=", "Lead"], ["reference_name", "=", name ?? ""]],
    orderBy: { field: "creation", order: "desc" },
    limit: 50,
  });

  const { data: comments, mutate: mutateComments } = useFrappeGetDocList("Comment", {
    fields: ["name", "content", "comment_email", "creation"],
    filters: [["reference_doctype", "=", "Lead"], ["reference_name", "=", name ?? ""], ["comment_type", "=", "Comment"]],
    orderBy: { field: "creation", order: "desc" },
    limit: 50,
  });

  type ActivityItem = {
    type: "communication" | "comment";
    name: string;
    content: string;
    author: string;
    creation: string;
    subject?: string;
    medium?: string;
  };

  const activityItems = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];
    if (communications) {
      for (const c of communications) {
        items.push({
          type: "communication",
          name: c.name,
          content: c.content ?? "",
          author: c.sender ?? "",
          creation: c.creation,
          subject: c.subject ?? undefined,
          medium: c.communication_medium ?? "Other",
        });
      }
    }
    if (comments) {
      for (const c of comments) {
        items.push({
          type: "comment",
          name: c.name,
          content: c.content ?? "",
          author: c.comment_email ?? "",
          creation: c.creation,
        });
      }
    }
    items.sort((a, b) => new Date(b.creation).getTime() - new Date(a.creation).getTime());
    return items;
  }, [communications, comments]);

  async function handleAddComment() {
    if (!commentText.trim() || !lead) return;
    setSubmittingComment(true);
    try {
      await createDoc("Comment", {
        comment_type: "Comment",
        reference_doctype: "Lead",
        reference_name: lead.name,
        content: commentText.trim(),
      });
      setCommentText("");
      mutateCommunications();
      mutateComments();
    } catch (err) {
      console.error("Failed to add comment:", err);
      alert("Failed to add comment. Please try again.");
    } finally {
      setSubmittingComment(false);
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!lead || newStatus === lead.status) return;
    setUpdatingStatus(true);
    try {
      await setValue({ doctype: "Lead", name: lead.name, fieldname: "status", value: newStatus });
      await mutate();
    } catch (err) {
      console.error("Failed to update status:", err);
      alert("Failed to update status. Please try again.");
    } finally {
      setUpdatingStatus(false);
    }
  }

  const isTerminalStatus = lead?.status === "Converted" || lead?.status === "Do Not Contact";

  async function handleConvert() {
    if (!lead) return;
    setConverting(true);
    try {
      const doc = await createDoc("Opportunity", {
        opportunity_from: "Lead",
        party_name: lead.name,
        status: "Open",
        source: lead.source,
      });
      setDialogOpen(false);
      navigate(`/crm/opportunities/${doc.name}`);
    } catch (err) {
      console.error("Failed to convert lead:", err);
      alert("Failed to convert lead. Please try again.");
    } finally {
      setConverting(false);
    }
  }

  if (!lead) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{lead.lead_name}</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={isTerminalStatus}>Convert to Opportunity</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Convert Lead to Opportunity</DialogTitle>
              <DialogDescription>
                This will create a new Opportunity linked to this Lead ({lead.lead_name}).
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleConvert} disabled={converting}>
                {converting ? "Converting..." : "Convert"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

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

      {/* Activity Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Comment form */}
          <div className="space-y-2">
            <Textarea
              placeholder="Add a comment..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              rows={3}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleAddComment}
                disabled={submittingComment || !commentText.trim()}
              >
                {submittingComment ? "Adding..." : "Add Comment"}
              </Button>
            </div>
          </div>

          <Separator />

          {/* Timeline */}
          {activityItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No activity yet. Add a comment to start the conversation.
            </p>
          ) : (
            <div className="space-y-4">
              {activityItems.map((item) => (
                <div key={`${item.type}-${item.name}`} className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant={item.type === "communication" ? "info" : "secondary"}>
                      {item.type === "communication" ? (item.medium ?? "Email") : "Comment"}
                    </Badge>
                    <span className="text-muted-foreground">{item.author}</span>
                    <span className="text-muted-foreground ml-auto">{formatDate(item.creation)}</span>
                  </div>
                  {item.subject && (
                    <p className="text-sm font-medium">{item.subject}</p>
                  )}
                  <div
                    className="text-sm text-muted-foreground prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: item.content }}
                  />
                  <Separator />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
