import { useEffect, useState } from "react";
import { AlertCircle, MessageSquare, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton rows; shown after 300 ms so fast loads don't flash. */
export function ChatListSkeleton() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return <div aria-busy="true" className="min-h-48" />;
  return (
    <div aria-busy="true" aria-label="Loading chats" className="space-y-1">
      {[70, 55, 65, 50, 60].map((w, i) => (
        <div key={i} className="flex items-center gap-3 px-3.5 py-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 rounded" style={{ width: `${w}%` }} />
            <Skeleton className="h-2.5 w-4/5 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ThreadSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading messages" className="flex flex-col gap-3 p-4">
      <Skeleton className="h-14 w-3/5 self-start rounded-[18px]" />
      <Skeleton className="h-16 w-2/3 self-end rounded-[18px]" />
      <Skeleton className="h-10 w-1/2 self-start rounded-[18px]" />
    </div>
  );
}

export function StatePanel({ icon, title, body, tone = "bg-accent text-accent-foreground", children }: {
  icon: React.ReactNode;
  title: string;
  body: string;
  tone?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className={`flex h-20 w-20 items-center justify-center rounded-full ${tone}`}>{icon}</div>
      <p className="text-lg font-semibold">{title}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{body}</p>
      {children}
    </div>
  );
}

export function ErrorPanel({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <div role="alert">
      <StatePanel
        tone="bg-danger-soft text-danger-soft-foreground"
        icon={<AlertCircle className="h-9 w-9" strokeWidth={1.4} aria-hidden />}
        title={title}
        body="The server didn't answer. Your data is safe."
      >
        <Button onClick={onRetry} className="bg-foreground text-background hover:bg-foreground/90">
          <RefreshCw aria-hidden />
          Try again
        </Button>
      </StatePanel>
    </div>
  );
}

export function NoChatSelected() {
  return (
    <StatePanel
      icon={<MessageSquare className="h-9 w-9" strokeWidth={1.4} aria-hidden />}
      title="Select a lead"
      body="Pick a conversation on the left to read its messages."
    />
  );
}
