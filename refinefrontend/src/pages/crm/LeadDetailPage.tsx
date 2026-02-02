import { useState, useRef, useEffect, useMemo } from "react";
import { useParams } from "react-router";
import { useOne, useList, useCreate, useCustomMutation, useInvalidate } from "@refinedev/core";
import DOMPurify from "dompurify";
import { formatDate, formatVND } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { extractErrorMessage } from "@/lib/errors";
import { DetailSkeleton } from "@/components/detail-skeleton";

const LEAD_STATUSES = ["Lead", "Open", "Replied", "Opportunity", "Quotation", "Lost Quotation", "Interested", "Converted", "Do Not Contact"];
const RELATIONSHIP_OPTIONS = ["Bride/Groom", "Mother of Bride/Groom", "Friend of Bride/Groom", "Other"];

function statusVariant(status: string) {
  switch (status) {
    case "Lead": return "info" as const;
    case "Open": return "warning" as const;
    case "Replied": case "Interested": case "Converted": case "Opportunity": case "Quotation": return "success" as const;
    case "Lost Quotation": case "Do Not Contact": return "destructive" as const;
    default: return "secondary" as const;
  }
}

// --- EditableField component ---

type EditableFieldProps = {
  label: string;
  value: string | number | undefined | null;
  displayValue?: string;
  fieldName: string;
  leadName: string;
  type?: "text" | "date" | "number" | "select";
  options?: string[];
  onSaved: () => void;
};

function EditableField({ label, value, displayValue, fieldName, leadName, type = "text", options, onSaved }: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value ?? ""));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { mutateAsync: customMutation } = useCustomMutation();

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function startEdit() {
    setEditValue(String(value ?? ""));
    setEditing(true);
  }

  async function save() {
    if (saving) return;
    const newValue = type === "number" ? (editValue === "" ? 0 : Number(editValue)) : editValue;
    if (String(newValue) === String(value ?? "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await customMutation({
        url: "/api/method/frappe.client.set_value",
        method: "post",
        values: { doctype: "Lead", name: leadName, fieldname: fieldName, value: newValue },
      });
      onSaved();
    } catch (err) {
      console.error(`Failed to update ${fieldName}:`, err);
      alert(extractErrorMessage(err, `Failed to update ${label}.`));
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  function cancel() {
    setEditing(false);
    setEditValue(String(value ?? ""));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); save(); }
    if (e.key === "Escape") { e.preventDefault(); cancel(); }
  }

  const isEmpty = value == null || value === "" || (type === "number" && value === 0);
  const shown = displayValue ?? (isEmpty ? "-" : String(value));

  if (editing && type === "select" && options) {
    return (
      <div className="flex justify-between items-center">
        <span className="text-muted-foreground text-sm">{label}</span>
        <Select value={editValue} onValueChange={(v) => { setEditValue(v); }}>
          <SelectTrigger className="w-[180px] h-8" autoFocus onKeyDown={(e) => { if (e.key === "Escape") cancel(); }}>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">—</SelectItem>
            {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-1 ml-2">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={save} disabled={saving}>Save</Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={cancel}>Cancel</Button>
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="flex justify-between items-center">
        <span className="text-muted-foreground text-sm">{label}</span>
        <Input
          ref={inputRef}
          type={type}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={save}
          onKeyDown={handleKeyDown}
          className="w-[180px] h-8 text-sm"
          disabled={saving}
        />
      </div>
    );
  }

  return (
    <div className="flex justify-between items-center group cursor-pointer" onClick={startEdit}>
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm group-hover:underline group-hover:decoration-dashed group-hover:underline-offset-4 group-hover:text-foreground transition-colors">
        {shown}
      </span>
    </div>
  );
}

// --- ReadOnlyField component ---

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm">{value || "-"}</span>
    </div>
  );
}

// --- Main page ---

export default function LeadDetailPage() {
  const { name } = useParams<{ name: string }>();
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  const invalidate = useInvalidate();
  const { result: lead } = useOne({ resource: "Lead", id: name! });

  const { mutateAsync: createDoc } = useCreate();
  const { mutateAsync: customMutation } = useCustomMutation();

  // Lead Sources for dropdown
  const { result: sourcesResult } = useList({
    resource: "Lead Source",
    pagination: { mode: "off" as const },
    meta: { fields: ["name"] },
  });
  const leadSources = (sourcesResult?.data ?? []).map((s: any) => s.name);

  // Activity: Communications + Comments
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

  function handleFieldSaved() {
    invalidate({ resource: "Lead", invalidates: ["detail"], id: name! });
  }

  if (!lead) {
    return <DetailSkeleton />;
  }

  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.lead_name;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{lead.lead_name}</h1>
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

      {/* Two-column grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ReadOnlyField label="Name" value={fullName} />
            <ReadOnlyField label="Email" value={lead.email_id ?? ""} />
            <ReadOnlyField label="Phone" value={lead.phone ?? ""} />
            {lead.mobile_no && <ReadOnlyField label="Mobile" value={lead.mobile_no} />}
            <ReadOnlyField label="Location" value={lead.city ?? ""} />
            <EditableField
              label="Source"
              value={lead.source}
              fieldName="source"
              leadName={lead.name}
              type="select"
              options={leadSources}
              onSaved={handleFieldSaved}
            />
            <ReadOnlyField label="Created" value={formatDate(lead.creation)} />
          </CardContent>
        </Card>

        {/* Wedding Details */}
        <Card>
          <CardHeader>
            <CardTitle>Wedding Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ReadOnlyField label="Relationship" value={lead.custom_relationship ?? ""} />
            <ReadOnlyField label="Couple Name" value={lead.custom_couple_name ?? ""} />
            <ReadOnlyField label="Wedding Date" value={lead.custom_wedding_date ? formatDate(lead.custom_wedding_date) : ""} />
            <ReadOnlyField label="Wedding Venue" value={lead.custom_wedding_venue ?? ""} />
            <ReadOnlyField label="Guest Count" value={lead.custom_guest_count ? String(lead.custom_guest_count) : ""} />
            <ReadOnlyField label="Estimated Budget" value={lead.custom_estimated_budget ? formatVND(lead.custom_estimated_budget) : ""} />
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {typeof lead.notes === "string" && lead.notes.trim() && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{lead.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Activity */}
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
