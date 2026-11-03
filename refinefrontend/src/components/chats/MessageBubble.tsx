import { useMemo, useState } from "react";
import { Phone, MessageSquare, Mail, Users, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { splitQuoted, stampTime, stripHtml } from "./chatFormat";
import { commStamp, type Communication } from "./useChatData";

const MEDIUM_ICONS: Record<string, typeof Phone> = {
  Phone, WhatsApp: MessageSquare, Email: Mail, Meeting: Users, Other: MoreHorizontal,
};

const LONG_MESSAGE = 700; // characters before a message is clamped behind "Show full message"

const BODY =
  "prose prose-sm max-w-none break-words text-[15px] leading-[22px] [&_a]:underline [&_img]:h-auto [&_img]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:overflow-x-auto";

export function MessageBubble({ comm, leadName }: { comm: Communication; leadName: string }) {
  const sent = comm.sent_or_received === "Sent";
  const [showQuoted, setShowQuoted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const Icon = MEDIUM_ICONS[comm.communication_medium] ?? MoreHorizontal;

  const { main, quoted } = useMemo(
    () => splitQuoted(comm.content ?? ""),
    [comm.content],
  );

  const long = stripHtml(main).length > LONG_MESSAGE;

  return (
    <div className={cn("flex max-w-[85%] flex-col gap-1 md:max-w-[70%]", sent ? "self-end items-end" : "self-start items-start")}>
      <div
        className={cn(
          "min-w-0 max-w-full px-3.5 py-2.5",
          sent
            ? "rounded-[18px_18px_6px_18px] bg-primary-fill text-primary-fill-foreground"
            : "rounded-[18px_18px_18px_6px] border bg-card text-card-foreground",
        )}
      >
        {comm.subject && <p className="mb-1 text-sm font-semibold">{comm.subject}</p>}
        <div className={cn(long && !expanded && "max-h-72 overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]")}>
          <div className={cn(BODY, sent && "prose-invert text-primary-fill-foreground")} dangerouslySetInnerHTML={{ __html: main }} />
        </div>
        {long && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="mt-1 inline-flex h-6 items-center rounded-full bg-black/10 px-2 text-xs font-semibold"
          >
            {expanded ? "Show less" : "Show full message"}
          </button>
        )}
        {quoted && (
          <>
            <button
              type="button"
              onClick={() => setShowQuoted((v) => !v)}
              aria-expanded={showQuoted}
              className="mt-1 inline-flex h-6 items-center rounded-full bg-black/10 px-2 text-xs font-semibold"
            >
              {showQuoted ? "Hide quoted text" : "Show quoted text"}
            </button>
            {showQuoted && (
              <div className={cn(BODY, "mt-2 opacity-80", sent && "prose-invert text-primary-fill-foreground")} dangerouslySetInnerHTML={{ __html: quoted }} />
            )}
          </>
        )}
      </div>
      <p className="flex items-center gap-1.5 px-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3 w-3" aria-hidden />
        <span>{sent ? "You" : leadName}</span>
        <span aria-hidden>·</span>
        <span>{comm.communication_medium}</span>
        <span aria-hidden>·</span>
        <time>{stampTime(commStamp(comm))}</time>
      </p>
    </div>
  );
}
