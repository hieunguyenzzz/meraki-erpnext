import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Section card used by the finance detail pages (D-Invoice / D-Expense): 17px title, optional aside, content. */
export function DetailCard({ title, aside, className, children }: { title: string; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className={cn("flex min-w-0 flex-col gap-3 rounded-card border bg-card p-5", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Label / value grid inside a DetailCard. */
export function Facts({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-y-2.5 text-sm md:grid-cols-[120px_minmax(0,1fr)]">{children}</dl>;
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="m-0 min-w-0 break-words font-medium tabular-nums">{children}</dd>
    </>
  );
}
