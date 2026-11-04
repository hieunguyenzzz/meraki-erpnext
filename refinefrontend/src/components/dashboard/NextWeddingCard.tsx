import { Link } from "react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { formatIsoWeekday } from "@/lib/format";
import type { HomeWedding } from "@/hooks/useHomePlanner";
import { ROLE_LABEL } from "@/hooks/useMyWeddings";

interface Props {
  wedding: HomeWedding | null | undefined;
  isLoading: boolean;
  isError: boolean;
  /** Where a wedding opens: "/projects" (planners) or "/my-weddings" (employee-only staff). */
  basePath: string;
}

function Checklist({ done, total }: { done: number; total: number }) {
  return (
    <div className="mt-2.5 flex max-w-[420px] flex-col gap-1.5">
      <div className="flex justify-between text-[13px]">
        <span>Checklist</span>
        <span className="text-muted-foreground tabular-nums">{done} of {total} done</span>
      </div>
      <div className="h-1.5 rounded-[3px] bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Checklist progress">
        <div className="h-1.5 rounded-[3px] bg-success" style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
      </div>
    </div>
  );
}

/** Hero card for the soonest upcoming wedding, with the days-to-go block and (when the wedding has tasks) checklist progress. */
export function NextWeddingCard({ wedding: w, isLoading, isError, basePath }: Props) {
  if (isLoading) return <Skeleton className="h-[120px] w-full rounded-[20px] md:h-[164px]" />;
  if (isError) {
    return (
      <p role="alert" className="rounded-[20px] bg-danger-soft p-4 text-sm text-danger-soft-foreground">
        Could not load your weddings. Please try again.
      </p>
    );
  }
  if (!w || w.days_to_go == null) {
    return (
      <div className="rounded-[20px] border bg-card p-4 text-sm text-muted-foreground md:p-6">No upcoming weddings assigned to you.</div>
    );
  }
  const today = w.days_to_go === 0;
  const meta = [
    w.wedding_date ? formatIsoWeekday(w.wedding_date) : null,
    w.venue_name,
    w.guest_count ? `${w.guest_count} guests` : null,
  ].filter(Boolean).join(" · ");
  return (
    <Link
      to={`${basePath}/${w.id}`}
      className="flex items-center justify-between gap-3 rounded-[20px] border border-primary/25 bg-card p-4 transition-colors hover:bg-accent/50 sm:p-[18px] md:gap-6 md:p-6"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 md:gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-warning">Next wedding</span>
        <span className="truncate font-display text-[30px] font-semibold leading-[34px] md:text-[40px] md:leading-[44px]">{w.couple_label || w.project_name}</span>
        <span className="truncate text-sm text-muted-foreground tabular-nums md:text-[15px]">{meta}</span>
        <span className="text-xs text-muted-foreground">{ROLE_LABEL[w.my_role]} · {w.stage}</span>
        {w.checklist && <Checklist done={w.checklist.done} total={w.checklist.total} />}
      </div>
      <div className="flex h-[72px] w-[68px] shrink-0 flex-col items-center justify-center rounded-card bg-accent text-accent-foreground md:h-[116px] md:w-[108px] md:rounded-[18px]">
        <span className="font-display text-[34px] font-semibold leading-8 lining-nums tabular-nums md:text-[56px] md:leading-[52px]">{today ? "0" : w.days_to_go}</span>
        <span className="text-xs font-semibold md:text-[13px]">{today ? "today" : w.days_to_go === 1 ? "day to go" : "days to go"}</span>
      </div>
    </Link>
  );
}
