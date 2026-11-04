import type { ReactNode } from "react";
import DOMPurify from "dompurify";
import { Card } from "@/components/ui/card";
import { dayLabel, stampDay, stampTime } from "@/components/chats/chatFormat";
import { NoteForm } from "@/components/crm/NoteForm";
import type { ActivityItem, NoteRef } from "@/components/crm/useActivityItems";

/** "Today 08:42" for today, "2026-11-02 10:05" otherwise. */
function when(stamp: string): string {
  const day = stampDay(stamp);
  const label = dayLabel(day);
  return `${label === day ? day : label} ${stampTime(stamp)}`;
}

function Row({ at, children }: { at: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 border-t py-3 text-sm leading-[21px] first:border-t-0">
      <time className="w-[128px] flex-none text-muted-foreground">{at}</time>
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </li>
  );
}

function Html({ html }: { html: string }) {
  return <span className="prose prose-sm inline max-w-none [&_p]:m-0 [&_p]:inline" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />;
}

/** Notes, stage changes and emails, newest first, ending with the lead's creation. */
export function LeadActivityTab({ items, leadName, primaryRef, created, source }: {
  items: ActivityItem[]; leadName: string; primaryRef: NoteRef; created: string; source?: string;
}) {
  return (
    <Card className="px-[18px] pb-2 pt-3">
      <div className="pb-3">
        <NoteForm primaryRef={primaryRef} />
      </div>
      <ul>
        {items.map((it) => (
          <Row key={it.id} at={when(it.creation)}>
            {it.type === "note" && (<><b>Note{it.author ? ` · ${it.author}` : ""}:</b> <Html html={it.content} /></>)}
            {it.type === "stage_change" && (<><b>Stage</b> <Html html={it.content} /></>)}
            {it.type === "email_received" && (<>{leadName} replied by email{it.subject ? <span className="text-muted-foreground"> · {it.subject}</span> : null}</>)}
            {it.type === "email_sent" && (<>{it.author || "Meraki"} replied by email{it.subject ? <span className="text-muted-foreground"> · {it.subject}</span> : null}</>)}
          </Row>
        ))}
        <Row at={when(created)}>Lead created{source ? ` from ${source}` : ""}</Row>
      </ul>
    </Card>
  );
}
