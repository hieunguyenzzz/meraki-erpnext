import { useEffect, useState } from "react";
import { AlertCircle, Bell, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** List skeleton matching the real rows; appears only after 300 ms so fast loads don't flash. */
export function NotificationSkeleton() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return <div aria-busy="true" className="min-h-48" />;

  return (
    <div aria-busy="true" aria-label="Loading notifications" className="divide-y overflow-hidden rounded-card border bg-card">
      {[70, 60, 75, 55].map((w, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 rounded" style={{ width: `${w}%` }} />
            <Skeleton className="h-2.5 w-1/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Panel({ tone, icon, title, body, children }: {
  tone: string;
  icon: React.ReactNode;
  title: string;
  body: string;
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

export function NotificationEmpty({ filtered }: { filtered: boolean }) {
  return (
    <Panel
      tone="bg-accent text-accent-foreground"
      icon={<Bell className="h-9 w-9" strokeWidth={1.4} aria-hidden />}
      title={filtered ? "Nothing of this type" : "You're all caught up"}
      body={filtered ? "Try another filter to see the rest." : "Leave requests, expenses and new leads will show up here."}
    />
  );
}

export function NotificationError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert">
      <Panel
        tone="bg-danger-soft text-danger-soft-foreground"
        icon={<AlertCircle className="h-9 w-9" strokeWidth={1.4} aria-hidden />}
        title="Couldn't load notifications"
        body="The server didn't answer. Your data is safe."
      >
        <Button onClick={onRetry} className="bg-foreground text-background hover:bg-foreground/90">
          <RefreshCw aria-hidden />
          Try again
        </Button>
      </Panel>
    </div>
  );
}
