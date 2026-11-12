import type { ReactNode } from "react";
import { Briefcase, Check } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function BrandTitle() {
  return <span className="font-display text-[26px] font-semibold leading-none">Meraki careers</span>;
}

/** Page frame: centred column on desktop, full-bleed on phones. No app shell. */
export function PageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-background text-foreground md:py-10">
      <div className="flex w-full max-w-xl flex-1 flex-col md:flex-none md:overflow-clip md:rounded-card md:border md:bg-card">
        {children}
      </div>
    </div>
  );
}

export function LoadingScreen() {
  return (
    <PageFrame>
      <div className="flex flex-col gap-4 px-6 pt-5" role="status" aria-label="Loading position">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-16 w-full rounded-card" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="mt-4 h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </PageFrame>
  );
}

export function NotFoundScreen() {
  return (
    <PageFrame>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-20 text-center">
        <Briefcase aria-hidden="true" className="h-10 w-10 text-muted-foreground" />
        <h1 className="font-display text-3xl font-semibold">Position not found</h1>
        <p className="text-sm text-muted-foreground">
          This job opening may have been closed or removed.
        </p>
        <p className="text-sm text-muted-foreground">
          Please contact us if you believe this is an error.
        </p>
      </div>
    </PageFrame>
  );
}

export function SuccessScreen({ jobTitle }: { jobTitle: string }) {
  return (
    <PageFrame>
      <div className="px-6 pt-5">
        <BrandTitle />
      </div>
      <div
        role="status"
        className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center"
      >
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success-soft-foreground">
          <Check aria-hidden="true" className="h-8 w-8" />
        </span>
        <h1 className="font-display text-3xl font-semibold">Application received</h1>
        <p className="text-muted-foreground">
          Thank you for applying for <span className="font-semibold text-foreground">{jobTitle}</span>.
        </p>
        <p className="text-sm text-muted-foreground">
          We'll review your application and be in touch soon. You may now close this page.
        </p>
      </div>
    </PageFrame>
  );
}
