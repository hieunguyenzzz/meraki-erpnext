import { Link } from "react-router";
import { Skeleton } from "@/components/ui/skeleton";
import type { MyWedding } from "@/hooks/useMyWeddings";
import { ROLE_LABEL } from "@/hooks/useMyWeddings";

interface Props {
  wedding: MyWedding | undefined;
  isLoading: boolean;
  isError: boolean;
  /** Where a wedding opens: "/projects" (planners) or "/my-weddings" (employee-only staff). */
  basePath: string;
}

/**
 * Hero card for the soonest upcoming wedding. There is no per-wedding checklist data
 * source yet, so unlike the design there is no progress bar.
 */
export function NextWeddingCard({ wedding: w, isLoading, isError, basePath }: Props) {
  if (isLoading) return <Skeleton className="h-[120px] w-full rounded-[20px]" />;
  if (isError) {
    return (
      <p role="alert" className="rounded-[20px] bg-danger-soft p-4 text-sm text-danger-soft-foreground">
        Could not load your weddings. Please try again.
      </p>
    );
  }
  if (!w || w.days_to_go == null) {
    return (
      <div className="rounded-[20px] border bg-card p-4 text-sm text-muted-foreground">No upcoming weddings assigned to you.</div>
    );
  }
  const today = w.days_to_go === 0;
  const meta = [w.wedding_date, w.venue_name].filter(Boolean).join(" · ");
  return (
    <Link
      to={`${basePath}/${w.id}`}
      className="flex items-start justify-between gap-3 rounded-[20px] border bg-card p-4 transition-colors hover:bg-accent/50 sm:p-[18px]"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-warning">Next wedding</span>
        <span className="truncate font-display text-[30px] font-semibold leading-[34px]">{w.project_name}</span>
        <span className="truncate text-sm text-muted-foreground tabular-nums">{meta}</span>
        <span className="text-xs text-muted-foreground">{ROLE_LABEL[w.my_role]} · {w.stage}</span>
      </div>
      <div className="flex h-[72px] w-[68px] shrink-0 flex-col items-center justify-center rounded-card bg-accent text-accent-foreground">
        <span className="text-[30px] font-bold leading-8 tabular-nums">{today ? "0" : w.days_to_go}</span>
        <span className="text-xs font-semibold">{today ? "today" : w.days_to_go === 1 ? "day" : "days"}</span>
      </div>
    </Link>
  );
}
