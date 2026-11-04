import type { ReactNode } from "react";
import { Briefcase, Check } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/** Desktop page frame: white brand bar over a centred 760px column. No app shell. */
export function DesktopFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b bg-card px-8 py-5">
        <span className="font-display text-[30px] font-semibold leading-none">Meraki careers</span>
        <span className="text-sm text-muted-foreground">About 5 minutes</span>
      </header>
      <main className="mx-auto flex w-full max-w-[760px] flex-1 flex-col gap-6 px-6 pb-14 pt-10">
        {children}
      </main>
    </div>
  );
}

export function DesktopLoading() {
  return (
    <DesktopFrame>
      <div className="flex flex-col gap-6" role="status" aria-label="Loading position">
        <Skeleton className="h-14 w-full rounded-card" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </DesktopFrame>
  );
}

export function DesktopNotFound() {
  return (
    <DesktopFrame>
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <Briefcase aria-hidden="true" className="h-10 w-10 text-muted-foreground" />
        <h1 className="font-display text-[40px] font-semibold leading-tight">Position not found</h1>
        <p className="text-sm text-muted-foreground">This job opening may have been closed or removed.</p>
        <p className="text-sm text-muted-foreground">Please contact us if you believe this is an error.</p>
      </div>
    </DesktopFrame>
  );
}

export function DesktopSuccess({ jobTitle, name }: { jobTitle: string; name: string }) {
  const first = name.trim().split(/\s+/)[0];
  return (
    <DesktopFrame>
      <section
        role="status"
        className="flex flex-col items-center gap-3.5 rounded-[20px] border bg-card px-8 py-12 text-center"
      >
        <span className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-success-soft text-success-soft-foreground">
          <Check aria-hidden="true" className="h-11 w-11" strokeWidth={2} />
        </span>
        <h1 className="font-display text-[40px] font-semibold leading-tight">
          {first ? `Thank you, ${first}` : "Application received"}
        </h1>
        <p className="max-w-[480px] text-base leading-6 text-muted-foreground">
          Your application for <span className="font-semibold text-foreground">{jobTitle}</span> is in. We'll
          review it and be in touch soon. You may now close this page.
        </p>
      </section>
    </DesktopFrame>
  );
}
