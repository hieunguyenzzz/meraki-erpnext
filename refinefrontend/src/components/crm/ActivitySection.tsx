import { useState, useMemo } from "react";
import { useList, useCreate, useInvalidate } from "@refinedev/core";
import DOMPurify from "dompurify";
import * as Popover from "@radix-ui/react-popover";
import { Check, Bell, Mail, MailOpen, RefreshCw, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { extractErrorMessage } from "@/lib/errors";

interface NoteRef {
  doctype: string;
  docName: string;
}

interface ActivitySectionProps {
  references: NoteRef[];
}

type ActivityItem = {
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

function ActivityFeed({ references }: ActivitySectionProps) {
  const ref0 = references[0];
  const ref1 = references.length > 1 ? references[1] : null;

  // Fetch Comments (both Comment and Info types)
  const { result: comments0 } = useCommentsForRef(ref0, ["Comment", "Info"]);
  const { result: comments1 } = useCommentsForRef(
    ref1 ?? { doctype: "__none__", docName: "__none__" },
    ["Comment", "Info"],
  );

  // Fetch Communications (emails)
  const { result: comms0 } = useCommunicationsForRef(ref0);
  const { result: comms1 } = useCommunicationsForRef(
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

    // Add communications from both refs
    for (const comm of ((comms0 as any)?.data ?? [])) addCommunication(comm);
    if (ref1) {
      for (const comm of ((comms1 as any)?.data ?? [])) addCommunication(comm);
    }

    // Sort by creation date (newest first)
    all.sort((a, b) => new Date(b.creation).getTime() - new Date(a.creation).getTime());
    return all;
  }, [comments0, comments1, comms0, comms1, ref1]);

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No activity yet. Add a note or send an email to start.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        let borderColor = "border-muted";
        let icon = <StickyNote className="h-4 w-4" />;
        let label = "Note";
        let bgColor = "bg-muted/30";

        switch (item.type) {
          case "email_sent":
            borderColor = "border-green-500";
            bgColor = "bg-green-50 dark:bg-green-950/30";
            icon = <Mail className="h-4 w-4 text-green-600" />;
            label = "Email Sent";
            break;
          case "email_received":
            borderColor = "border-blue-500";
            bgColor = "bg-blue-50 dark:bg-blue-950/30";
            icon = <MailOpen className="h-4 w-4 text-blue-600" />;
            label = "Email Received";
            break;
          case "stage_change":
            borderColor = "border-gray-400";
            bgColor = "bg-gray-50 dark:bg-gray-900/30";
            icon = <RefreshCw className="h-4 w-4 text-gray-500" />;
            label = "Stage Changed";
            break;
          case "note":
            borderColor = "border-yellow-500";
            bgColor = "bg-yellow-50 dark:bg-yellow-950/30";
            icon = <StickyNote className="h-4 w-4 text-yellow-600" />;
            label = "Note";
            break;
        }

        return (
          <div key={item.id} className={cn("border-l-2 rounded-r-md p-3", borderColor, bgColor)}>
            <div className="flex items-center gap-2 text-sm flex-wrap">
              {icon}
              <span className="font-medium">{label}</span>
              {item.subject && (
                <>
                  <span className="text-muted-foreground">&middot;</span>
                  <span className="text-muted-foreground truncate max-w-[200px]">{item.subject}</span>
                </>
              )}
              {item.author && (
                <>
                  <span className="text-muted-foreground">&middot;</span>
                  <span className="text-muted-foreground">{item.author}</span>
                </>
              )}
              <span className="text-muted-foreground ml-auto text-xs">{formatDate(item.creation)}</span>
            </div>
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
  const [notifyStaff, setNotifyStaff] = useState(false);
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const { mutateAsync: createDoc } = useCreate();
  const invalidate = useInvalidate();

  const primaryRef = references[0];

  const { result: employeesResult } = useList({
    resource: "Employee",
    pagination: { pageSize: 100 },
    filters: [{ field: "status", operator: "eq", value: "Active" }],
    meta: { fields: ["name", "employee_name", "company_email", "personal_email"] },
  });

  const employees = useMemo(() => {
    const data = (employeesResult as any)?.data ?? [];
    return data
      .map((e: any) => ({
        id: e.name as string,
        name: e.employee_name as string,
        email: (e.company_email || e.personal_email || "") as string,
      }))
      .filter((e: { email: string }) => e.email);
  }, [employeesResult]);

  function toggleEmployee(id: string) {
    setSelectedEmployees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

      // Send email notification if staff selected
      if (notifyStaff && selectedEmployees.size > 0) {
        const recipientEmails = employees
          .filter((e: { id: string }) => selectedEmployees.has(e.id))
          .map((e: { email: string }) => e.email)
          .join(", ");

        try {
          await createDoc({
            resource: "Communication",
            values: {
              communication_type: "Notification",
              communication_medium: "Email",
              subject: `New note on ${primaryRef.doctype} ${primaryRef.docName}`,
              content: `<p>${commentText.trim().replace(/\n/g, "<br>")}</p><hr><p><a href="/app/${primaryRef.doctype.toLowerCase().replace(/ /g, "-")}/${primaryRef.docName}">View in ERPNext</a></p>`,
              recipients: recipientEmails,
              send_email: 1,
              reference_doctype: primaryRef.doctype,
              reference_name: primaryRef.docName,
            },
          });
        } catch (emailErr) {
          console.error("Failed to send email notification:", emailErr);
        }
      }

      setCommentText("");
      setNotifyStaff(false);
      setSelectedEmployees(new Set());
      invalidate({ resource: "Comment", invalidates: ["list"] });
    } catch (err) {
      console.error("Failed to add note:", err);
      alert(extractErrorMessage(err, "Failed to add note. Please try again."));
    } finally {
      setSubmittingComment(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity Timeline</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Textarea
            placeholder="Add an internal note..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            rows={3}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const next = !notifyStaff;
                setNotifyStaff(next);
                if (!next) setSelectedEmployees(new Set());
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                notifyStaff
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Bell className="h-3.5 w-3.5" />
              Notify staff
            </button>

            {notifyStaff && (
              <Popover.Root>
                <Popover.Trigger asChild>
                  <Button variant="outline" size="sm" className="h-8 border-dashed text-xs">
                    {selectedEmployees.size > 0
                      ? `${selectedEmployees.size} selected`
                      : "Select staff..."}
                  </Button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    className="z-50 w-[220px] max-h-[300px] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
                    align="start"
                    sideOffset={4}
                  >
                    {employees.map((emp: { id: string; name: string }) => {
                      const isSelected = selectedEmployees.has(emp.id);
                      return (
                        <button
                          key={emp.id}
                          onClick={() => toggleEmployee(emp.id)}
                          className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                        >
                          <div
                            className={cn(
                              "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                              isSelected ? "bg-primary text-primary-foreground" : "opacity-50"
                            )}
                          >
                            {isSelected && <Check className="h-4 w-4" />}
                          </div>
                          <span>{emp.name}</span>
                        </button>
                      );
                    })}
                    {selectedEmployees.size > 0 && (
                      <>
                        <div className="-mx-1 my-1 h-px bg-muted" />
                        <button
                          onClick={() => setSelectedEmployees(new Set())}
                          className="flex w-full cursor-default select-none items-center justify-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                        >
                          Clear all
                        </button>
                      </>
                    )}
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            )}

            <div className="ml-auto">
              <Button size="sm" onClick={handleAddComment} disabled={submittingComment || !commentText.trim()}>
                {submittingComment ? "Adding..." : "Add Note"}
              </Button>
            </div>
          </div>
        </div>

        <Separator />

        <ActivityFeed references={references} />
      </CardContent>
    </Card>
  );
}

// Keep backwards compatibility - export the old name too
export { ActivitySection as InternalNotesSection };
