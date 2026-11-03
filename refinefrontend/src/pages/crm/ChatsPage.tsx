import { useSearchParams } from "react-router";
import { ChatList } from "@/components/chats/ChatList";
import { ChatThread } from "@/components/chats/ChatThread";
import { NoChatSelected } from "@/components/chats/ChatStates";
import { useChatSummaries } from "@/components/chats/useChatData";

/** Lead conversations: two panes on desktop, list then full-screen thread on phones. The open lead lives in ?lead=. */
export default function ChatsPage() {
  const [params, setParams] = useSearchParams();
  const selected = params.get("lead");
  const { chats, isLoading, isError, refetch } = useChatSummaries();

  const lead = chats.find((c) => c.name === selected) ?? null;

  const select = (name: string) => setParams({ lead: name });
  const back = () => setParams({});

  return (
    <div className="grid grid-cols-1 md:-m-6 md:-mb-[calc(104px+env(safe-area-inset-bottom,0px))] md:h-[calc(100dvh-3.5rem)] md:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]">
      <ChatList
        chats={chats}
        selected={selected}
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        onSelect={select}
      />
      {lead ? (
        <ChatThread key={lead.name} lead={lead} onBack={back} />
      ) : (
        <div className="hidden md:block">
          {!isLoading && !isError && <NoChatSelected />}
        </div>
      )}
    </div>
  );
}
