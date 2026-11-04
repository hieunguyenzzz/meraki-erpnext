import { useMemo, useState, type FormEvent } from "react";
import { useCreate, useInvalidate, useList } from "@refinedev/core";
import DOMPurify from "dompurify";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/wedding/SectionCard";
import { extractErrorMessage } from "@/lib/errors";
import { getInitials } from "@/lib/initials";
import { cn } from "@/lib/utils";
import type { WeddingData } from "./useWeddingData";

const TONES = [
  "bg-accent text-accent-foreground",
  "bg-success-soft text-success-soft-foreground",
  "bg-warning-soft text-warning-soft-foreground",
  "bg-info-soft text-info-soft-foreground",
];
const toneFor = (key: string) => TONES[[...key].reduce((n, c) => n + c.charCodeAt(0), 0) % TONES.length];

/** The three newest internal notes plus a one-line box to add one; same Comment records as the Notes tab. */
export function NotesCard({ w, onOpenAll }: { w: WeddingData; onOpenAll: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync: createDoc, mutation } = useCreate();
  const isPending = mutation.isPending;
  const invalidate = useInvalidate();

  const { result, query } = useList({
    resource: "Comment",
    pagination: { pageSize: 3 },
    sorters: [{ field: "creation", order: "desc" }],
    filters: [
      { field: "reference_doctype", operator: "eq", value: "Project" },
      { field: "reference_name", operator: "eq", value: w.name },
      { field: "comment_type", operator: "eq", value: "Comment" },
    ],
    meta: { fields: ["name", "content", "comment_email", "creation"] },
  });
  const notes = (result?.data ?? []) as { name: string; content: string; comment_email: string; creation: string }[];
  const total = result?.total ?? notes.length;

  const authorOf = useMemo(() => {
    const byUser = new Map(w.employees.filter((e) => e.userId).map((e) => [e.userId!, e]));
    return (email: string) => {
      const emp = byUser.get(email);
      const first = emp?.firstName || emp?.name.split(" ").pop() || email.split("@")[0] || "Unknown";
      return { first, initials: getInitials(emp?.name || first) };
    };
  }, [w.employees]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content || isPending) return;
    setError(null);
    try {
      await createDoc({ resource: "Comment", values: { comment_type: "Comment", reference_doctype: "Project", reference_name: w.name, content } });
      setText("");
      invalidate({ resource: "Comment", invalidates: ["list"] });
    } catch (err) {
      console.error("[wedding] add note from overview failed", w.name, err);
      setError(extractErrorMessage(err, "Failed to add note. Please try again."));
    }
  }

  return (
    <SectionCard
      title="Latest notes"
      action={
        total > 0 && (
          <button type="button" onClick={onOpenAll} className="text-sm font-semibold text-primary hover:underline">
            See all {total}
          </button>
        )
      }
    >
      {query.isError ? (
        <p className="text-sm text-destructive">Could not load notes.</p>
      ) : notes.length === 0 ? (
        !query.isLoading && <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map((n, i) => {
            const a = authorOf(n.comment_email ?? "");
            return (
              <li key={n.name} className={cn("flex gap-2.5 text-sm leading-[21px]", i > 0 && "border-t pt-3")}>
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold", toneFor(n.comment_email ?? ""))}>{a.initials}</span>
                <span className="min-w-0 flex-1 break-words">
                  <b className="font-semibold">{a.first}</b>
                  <span className="text-muted-foreground"> · {n.creation.slice(0, 16)}</span>
                  <span className="block [&_p]:m-0" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(n.content ?? "") }} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={submit}>
        <label className="sr-only" htmlFor="overview-add-note">Add a note</label>
        <Input id="overview-add-note" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note" disabled={isPending} className="h-11" />
        {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      </form>
    </SectionCard>
  );
}
