import type { ComponentProps } from "react";
import { MessageSquare } from "lucide-react";
import type { Communication } from "@/components/chats/useChatData";
import { SuggestedResponseSection } from "@/components/crm/SuggestedResponseSection";
import { MailCard } from "./MailCard";

type SuggestionProps = ComponentProps<typeof SuggestedResponseSection>;

/** The email thread, oldest first, with the AI suggested reply below when the client wrote last. */
export function LeadConversationTab({ items, leadName, suggestion }: {
  items: Communication[]; leadName: string; suggestion: SuggestionProps;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border bg-card py-10 text-center text-muted-foreground">
          <MessageSquare className="h-8 w-8" strokeWidth={1.4} aria-hidden />
          <p className="text-sm">No conversations logged yet.</p>
        </div>
      ) : (
        items.map((c) => <MailCard key={c.name} comm={c} leadName={leadName} />)
      )}
      <SuggestedResponseSection {...suggestion} />
    </div>
  );
}
