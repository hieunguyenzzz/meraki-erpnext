import { useState, useMemo } from "react";
import { useList, useCreate, useInvalidate } from "@refinedev/core";
import DOMPurify from "dompurify";
import * as Popover from "@radix-ui/react-popover";
import { Check, Bell } from "lucide-react";
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

interface InternalNotesSectionProps {
  references: NoteRef[];
}

type NoteItem = {
  name: string;
  content: string;
  author: string;
  creation: string;
};

function useCommentsForRef(ref: NoteRef) {
  return useList({
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
}

function NotesFeed({ references }: InternalNotesSectionProps) {
  const ref0 = references[0];
  const ref1 = references.length > 1 ? references[1] : null;

  const { result: result0 } = useCommentsForRef(ref0);
  const { result: result1 } = useCommentsForRef(
    ref1 ?? { doctype: "__none__", docName: "__none__" },
  );

  const items = useMemo<NoteItem[]>(() => {
    const all: NoteItem[] = [];

    function addFromResult(result: any) {
      for (const c of (result?.data ?? []) as any[]) {
        all.push({
          name: c.name,
          content: c.content ?? "",
          author: c.comment_email ?? "",
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
        No internal notes yet. Add a note to start.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.name} className="bg-muted/30 border-l-2 border-muted rounded-r-md p-3">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className="text-muted-foreground font-medium">Note</span>
            <span className="text-muted-foreground">&middot;</span>
            <span className="text-muted-foreground">{item.author}</span>
            <span className="text-muted-foreground ml-auto text-xs">{formatDate(item.creation)}</span>
          </div>
          <div
            className="text-sm text-muted-foreground prose prose-sm max-w-none mt-1"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.content) }}
          />
        </div>
      ))}
    </div>
  );
}

export function InternalNotesSection({ references }: InternalNotesSectionProps) {
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
        <CardTitle>Internal Notes</CardTitle>
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

        <NotesFeed references={references} />
      </CardContent>
    </Card>
  );
}
