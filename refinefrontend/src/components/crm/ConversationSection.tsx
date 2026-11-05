import { Fragment } from "react";
import { MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageBubble } from "@/components/chats/MessageBubble";
import { dayLabel, stampDay } from "@/components/chats/chatFormat";
import { commStamp } from "@/components/chats/useChatData";
import { useConversationItems, type ConversationRef } from "./useConversationItems";

interface ConversationSectionProps {
  references: ConversationRef[];
  /** Shown under each received message; defaults to "Client" */
  leadName?: string;
}

function ConversationFeed({ references, leadName = "Client" }: ConversationSectionProps) {
  const { items } = useConversationItems(references);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
        <MessageSquare className="h-8 w-8" strokeWidth={1.4} aria-hidden />
        <p className="text-sm">No conversations logged yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((c, i) => {
        const day = stampDay(commStamp(c));
        const newDay = i === 0 || day !== stampDay(commStamp(items[i - 1]));
        return (
          <Fragment key={c.name}>
            {newDay && (
              <div className="my-1 self-center rounded-xl bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                {dayLabel(day)}
              </div>
            )}
            <MessageBubble comm={c} leadName={leadName} />
          </Fragment>
        );
      })}
    </div>
  );
}

export function ConversationSection({ references, leadName }: ConversationSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversation</CardTitle>
      </CardHeader>
      <CardContent className="sm:pt-0">
        <ConversationFeed references={references} leadName={leadName} />
      </CardContent>
    </Card>
  );
}
