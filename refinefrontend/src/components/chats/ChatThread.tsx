import { Fragment, useEffect, useRef } from "react";
import { Link } from "react-router";
import { ChevronLeft, ExternalLink, MessageSquare } from "lucide-react";
import { getInitials } from "@/lib/initials";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { avatarTone, dayLabel, stampDay } from "./chatFormat";
import { commStamp, useLeadConversation, type ChatLead } from "./useChatData";
import { MessageBubble } from "./MessageBubble";
import { ErrorPanel, StatePanel, ThreadSkeleton } from "./ChatStates";

interface Props {
  lead: ChatLead;
  onBack: () => void;
}

/** Wedding date as shown on the lead: the raw text if present, else the formatted date. */
function weddingDate(lead: ChatLead): string | null {
  if (lead.custom_wedding_date_raw) return lead.custom_wedding_date_raw;
  return lead.custom_wedding_date ? formatDate(lead.custom_wedding_date) : null;
}

export function ChatThread({ lead, onBack }: Props) {
  const { data: comms = [], isLoading, isError, refetch } = useLeadConversation(lead.name);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollerRef.current; // scroll this pane only, never the page behind it
    if (el) el.scrollTop = el.scrollHeight;
  }, [comms.length, lead.name, isLoading]);

  const date = weddingDate(lead);

  return (
    <section
      aria-label={`Conversation with ${lead.lead_name}`}
      className="fixed inset-0 z-[60] flex flex-col bg-background md:static md:z-auto md:h-full md:min-w-0"
    >
      <header className="z-10 flex shrink-0 items-center gap-2 border-b bg-card py-2 pl-1 pr-3 md:gap-3 md:px-6 md:py-4">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to chats" className="h-12 w-12 md:hidden">
          <ChevronLeft className="h-[22px] w-[22px]" aria-hidden />
        </Button>
        <Avatar className="h-10 w-10">
          <AvatarFallback className={`text-sm font-bold ${avatarTone(lead.lead_name)}`}>{getInitials(lead.lead_name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold">{lead.lead_name}</h2>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground md:text-[13px]">
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{lead.status}</Badge>
            {date && <span className="truncate">Wedding {date}</span>}
            {lead.email_id && <span className="hidden truncate md:inline">· {lead.email_id}</span>}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild className="shrink-0">
          <Link to={`/crm/leads/${lead.name}`}>
            <span className="max-md:sr-only">Open lead</span>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </Button>
      </header>

      <div ref={scrollerRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-4 md:px-6">
        {isLoading ? (
          <ThreadSkeleton />
        ) : isError ? (
          <ErrorPanel title="Couldn't load messages" onRetry={() => refetch()} />
        ) : comms.length === 0 ? (
          <StatePanel
            icon={<MessageSquare className="h-9 w-9" strokeWidth={1.4} aria-hidden />}
            title="No messages yet"
            body="Emails and messages with this lead will appear here."
          />
        ) : (
          comms.map((c, i) => {
            const day = stampDay(commStamp(c));
            const newDay = i === 0 || day !== stampDay(commStamp(comms[i - 1]));
            return (
              <Fragment key={c.name}>
                {newDay && (
                  <div className="my-1 self-center rounded-xl bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                    {dayLabel(day)}
                  </div>
                )}
                <MessageBubble comm={c} leadName={lead.lead_name} />
              </Fragment>
            );
          })
        )}
      </div>

      <footer className="border-t bg-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <p className="text-center text-xs text-muted-foreground">
          Replies are sent via your email client. This view is for reference only.
        </p>
      </footer>
    </section>
  );
}
