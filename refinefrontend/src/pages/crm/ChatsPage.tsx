import { useLocation, useNavigate, useSearchParams } from "react-router";
import { ChatList } from "@/components/chats/ChatList";
import { ChatThread } from "@/components/chats/ChatThread";
import { ChatUnavailable, NoChatSelected } from "@/components/chats/ChatStates";
import { useChatSummaries } from "@/components/chats/useChatData";

/** Lead conversations: two panes on desktop, list then full-screen thread on phones. The open lead lives in ?lead=. */
export default function ChatsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const selected = params.get("lead");
  const { chats, isLoading, isError, refetch } = useChatSummaries();

  const lead = chats.find((c) => c.name === selected) ?? null;
  const ready = !isLoading && !isError;

  // Mark entries opened from the list, so Back can pop them instead of stacking a new list entry.
  const select = (name: string) => setParams({ lead: name }, { state: { fromList: true } });
  const back = () => {
    if ((location.state as { fromList?: boolean } | null)?.fromList) navigate(-1);
    else setParams({}, { replace: true });
  };

  return (
    <div className="grid grid-cols-1 md:absolute md:inset-0 md:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]">
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
      ) : selected && ready ? (
        <ChatUnavailable leadName={selected} onBack={back} />
      ) : (
        <div className="hidden md:block">{ready && <NoChatSelected />}</div>
      )}
    </div>
  );
}
