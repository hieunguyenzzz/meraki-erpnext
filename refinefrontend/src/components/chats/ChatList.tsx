import { useMemo, useState } from "react";
import { Search, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/initials";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { avatarTone, listStamp, stripHtml } from "./chatFormat";
import { commStamp, type ChatSummary } from "./useChatData";
import { ChatListSkeleton, ErrorPanel, StatePanel } from "./ChatStates";

interface Props {
  chats: ChatSummary[];
  selected: string | null;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onSelect: (name: string) => void;
}

export function ChatList({ chats, selected, isLoading, isError, onRetry, onSelect }: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter(
      (l) => l.lead_name.toLowerCase().includes(q) || l.email_id?.toLowerCase().includes(q),
    );
  }, [chats, search]);

  return (
    <section aria-label="Conversations" className="flex h-full min-h-0 flex-col gap-1.5 md:border-r md:px-3 md:py-5">
      <h1 className="mx-1.5 mb-2 font-display text-[32px] font-semibold leading-tight">Chats</h1>
      <label className="relative mx-0.5 mb-2 flex">
        <span className="sr-only">Search chats</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          placeholder="Search leads"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 rounded-full pl-10 max-md:pl-10"
        />
      </label>

      <div className="min-h-0 flex-1 md:overflow-y-auto">
        {isLoading ? (
          <ChatListSkeleton />
        ) : isError ? (
          <ErrorPanel title="Couldn't load chats" onRetry={onRetry} />
        ) : filtered.length === 0 ? (
          <StatePanel
            icon={<MessageSquare className="h-9 w-9" strokeWidth={1.4} aria-hidden />}
            title={search.trim() ? "No matches" : "No conversations yet"}
            body={
              search.trim()
                ? "Try another name or email."
                : "Leads appear here once they have emails or messages."
            }
          />
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((lead) => {
              const active = selected === lead.name;
              const preview = stripHtml(lead.lastComm.content).slice(0, 80);
              return (
                <li key={lead.name}>
                  <button
                    type="button"
                    onClick={() => onSelect(lead.name)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-colors hover:bg-muted",
                      active && "bg-accent hover:bg-accent",
                    )}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className={cn("text-[13px] font-bold", active ? "bg-card text-accent-foreground" : avatarTone(lead.lead_name))}>
                        {getInitials(lead.lead_name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <b className="truncate text-sm">{lead.lead_name}</b>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {listStamp(commStamp(lead.lastComm))}
                        </span>
                      </span>
                      <span className="block truncate text-[13px] text-muted-foreground">
                        {lead.lastComm.sent_or_received === "Sent" && "You: "}
                        {preview}
                      </span>
                      <span className="mt-1 flex items-center gap-2">
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{lead.status}</Badge>
                        <span className="text-[10px] text-muted-foreground">{lead.commCount} messages</span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
