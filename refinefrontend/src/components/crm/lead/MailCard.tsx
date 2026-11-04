import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { splitQuoted, stampDay, stampTime, stripHtml } from "@/components/chats/chatFormat";
import { commStamp, type Communication } from "@/components/chats/useChatData";

const LONG_MESSAGE = 700; // characters before a message is clamped behind "Show full message"

const BODY =
  "prose prose-sm max-w-none break-words text-sm leading-[21px] [&_a]:underline [&_img]:h-auto [&_img]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:overflow-x-auto";

const TOGGLE = "inline-flex h-6 w-fit items-center rounded-full bg-muted px-2 text-xs font-semibold";

/** One email in the lead thread: sender and ISO stamp on top, sanitised body below, replies tinted rose. */
export function MailCard({ comm, leadName }: { comm: Communication; leadName: string }) {
  const sent = comm.sent_or_received === "Sent";
  const [showQuoted, setShowQuoted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const stamp = commStamp(comm);

  const { main, quoted, long } = useMemo(() => {
    const parts = splitQuoted(comm.content ?? "");
    return { ...parts, long: stripHtml(parts.main).length > LONG_MESSAGE };
  }, [comm.content]);

  return (
    <article className={cn("flex flex-col gap-1.5 rounded-xl border px-4 py-3.5 text-sm", sent ? "border-primary/30 bg-accent/60" : "bg-card")}>
      <div className="flex items-baseline justify-between gap-3">
        <b className="min-w-0 break-words">{sent ? "Meraki" : leadName}</b>
        <time className="shrink-0 text-xs text-muted-foreground">{stampDay(stamp)} {stampTime(stamp)}</time>
      </div>
      {comm.subject && <p className="font-semibold">{comm.subject}</p>}
      <div className={cn(long && !expanded && "max-h-72 overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]")}>
        <div className={BODY} dangerouslySetInnerHTML={{ __html: main }} />
      </div>
      {long && (
        <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className={TOGGLE}>
          {expanded ? "Show less" : "Show full message"}
        </button>
      )}
      {quoted && (
        <>
          <button type="button" onClick={() => setShowQuoted((v) => !v)} aria-expanded={showQuoted} className={TOGGLE}>
            {showQuoted ? "Hide quoted text" : "Show quoted text"}
          </button>
          {showQuoted && <div className={cn(BODY, "opacity-80")} dangerouslySetInnerHTML={{ __html: quoted }} />}
        </>
      )}
    </article>
  );
}
