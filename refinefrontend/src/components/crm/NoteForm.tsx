import { useState, useMemo } from "react";
import { useCreate, useInvalidate } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";
import * as Popover from "@radix-ui/react-popover";
import { Check, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { extractErrorMessage } from "@/lib/errors";
import type { NoteRef } from "./useActivityItems";

/** Internal note box with the optional "notify staff" email. */
export function NoteForm({ primaryRef }: { primaryRef: NoteRef }) {
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [notifyStaff, setNotifyStaff] = useState(false);
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const { mutateAsync: createDoc } = useCreate();
  const invalidate = useInvalidate();

  const { data: directoryResult } = useQuery({
    queryKey: ["employees-directory"],
    queryFn: async () => {
      const res = await fetch("/inquiry-api/employees/directory", { credentials: "include" });
      if (!res.ok) throw new Error(`Directory failed: ${res.status}`);
      return res.json() as Promise<{ data: any[] }>;
    },
  });

  const employees = useMemo(() => {
    const data = directoryResult?.data ?? [];
    return data
      .filter((e) => e.status === "Active")
      .map((e) => ({
        id: e.name as string,
        name: e.employee_name as string,
        email: (e.notification_email || "") as string,
      }))
      .filter((e: { email: string }) => e.email);
  }, [directoryResult]);

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
  );
}
