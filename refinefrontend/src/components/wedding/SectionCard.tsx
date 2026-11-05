import type { ReactNode } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

/** Titled card used across the wedding page; `action` sits at the right of the title. */
export function SectionCard({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-3.5 rounded-card border bg-card p-4 sm:p-5", className)}>
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-2 gap-y-2">
        <h2 className="text-[17px] font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Round pencil button that opens a card's edit panel. */
export function EditIconButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Pencil className="h-4 w-4" />
    </button>
  );
}

/** Label / value rows. */
export function FactList({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[110px_1fr] gap-y-3 text-sm sm:grid-cols-[120px_1fr]">
      {rows.map((r) => (
        <div key={r.label} className="col-span-2 grid grid-cols-subgrid">
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd className="min-w-0 break-words font-medium tabular-nums">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
