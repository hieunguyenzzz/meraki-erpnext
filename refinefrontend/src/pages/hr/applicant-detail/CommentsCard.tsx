import { useMemo, useRef, useState } from "react";
import { useList } from "@refinedev/core";
import { MentionsInput, Mention } from "react-mentions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { isoDate } from "../employee-detail/dates";
import { commentToSafeHtml, toFrappeHTML } from "./commentHtml";
import type { CommentRow, MentionUser } from "./types";

const mentionInputStyle = {
  control: { fontSize: "14px", minHeight: "96px" },
  highlighter: {
    padding: "8px 12px",
    fontSize: "14px",
    fontFamily: "inherit",
    lineHeight: "1.5",
    minHeight: "80px",
    border: "1px solid transparent",
    boxSizing: "border-box" as const,
  },
  input: {
    padding: "8px 12px",
    border: "1px solid hsl(var(--input))",
    borderRadius: "10px",
    fontSize: "14px",
    outline: "none",
    minHeight: "80px",
    resize: "none" as const,
    width: "100%",
    fontFamily: "inherit",
    lineHeight: "1.5",
    boxSizing: "border-box" as const,
    backgroundColor: "hsl(var(--background))",
    color: "hsl(var(--foreground))",
  },
  suggestions: {
    list: {
      backgroundColor: "hsl(var(--popover))",
      border: "1px solid hsl(var(--border))",
      borderRadius: "12px",
      boxShadow: "0 12px 28px rgb(0 0 0 / 0.18)",
      overflow: "hidden",
      zIndex: 50,
    },
    item: { padding: "6px 12px", fontSize: "14px", cursor: "pointer" },
  },
};

export function CommentsCard({ name }: { name: string }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const { result, query } = useList({
    resource: "Comment",
    pagination: { mode: "off" },
    sorters: [{ field: "creation", order: "asc" }],
    filters: [
      { field: "reference_doctype", operator: "eq", value: "Job Applicant" },
      { field: "reference_name", operator: "eq", value: name },
      { field: "comment_type", operator: "eq", value: "Comment" },
    ],
    meta: { fields: ["name", "content", "owner", "creation"] },
  });
  const comments = (result?.data ?? []) as unknown as CommentRow[];

  const { result: usersResult } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "eq", value: "Active" }],
    meta: { fields: ["name", "employee_name", "user_id"] },
  });
  const mentionUsers = useMemo<MentionUser[]>(
    () =>
      ((usersResult?.data ?? []) as unknown as { employee_name: string; user_id?: string }[])
        .filter((e) => e.user_id)
        .map((e) => ({ id: e.user_id as string, display: e.employee_name })),
    [usersResult?.data]
  );

  async function add() {
    if (!value.trim() || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/inquiry-api/applicants/${name}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: toFrappeHTML(value) }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      setValue("");
      query?.refetch?.();
    } catch (err) {
      console.error("Applicant comment failed", name, err);
      setError("Could not add the comment. Try again.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Comments{comments.length > 0 ? ` · ${comments.length}` : ""}</CardTitle></CardHeader>
      <CardContent>
        <div className="mb-4 space-y-4">
          {query?.isLoading && (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-4/5" />
            </div>
          )}
          {query?.isError && <p role="alert" className="text-sm text-danger-soft-foreground">Could not load comments.</p>}
          {!query?.isLoading && !query?.isError && comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
          {comments.map((c) => (
            <div key={c.name} className="flex gap-2.5 text-sm leading-relaxed">
              <StaffAvatar name={c.owner} id={c.owner} className="h-8 w-8 text-[11px]" />
              <div className="min-w-0">
                <div>
                  <span className="font-semibold">{c.owner}</span>
                  <span className="ml-2 text-muted-foreground">{isoDate(c.creation)}</span>
                </div>
                <div
                  className="whitespace-pre-wrap break-words [&_mark]:rounded-md [&_mark]:bg-accent [&_mark]:px-1 [&_mark]:font-semibold [&_mark]:text-accent-foreground"
                  dangerouslySetInnerHTML={{ __html: commentToSafeHtml(c.content) }}
                />
              </div>
            </div>
          ))}
        </div>
        <MentionsInput
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Add a comment... type @ to mention"
          style={mentionInputStyle}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void add();
            }
          }}
        >
          <Mention
            trigger="@"
            markup="@[__display__](__id__)"
            data={mentionUsers}
            displayTransform={(_id: string, display: string) => `@${display}`}
            renderSuggestion={(s, _search, _highlight, _idx, focused) => (
              <div style={{ padding: "10px 12px", fontSize: "14px", cursor: "pointer", backgroundColor: focused ? "hsl(var(--accent))" : "transparent" }}>
                <span style={{ fontWeight: 500 }}>{s.display}</span>
              </div>
            )}
            style={{ backgroundColor: "hsl(var(--primary) / 0.1)", borderRadius: "3px" }}
            appendSpaceOnAdd
          />
        </MentionsInput>
        {error && <p role="alert" className="mt-2 text-sm text-danger-soft-foreground">{error}</p>}
        <div className="mt-2 flex justify-end">
          <Button onClick={() => void add()} disabled={!value.trim() || saving} className="h-12 md:h-10">
            {saving ? "Adding..." : "Add Comment"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
