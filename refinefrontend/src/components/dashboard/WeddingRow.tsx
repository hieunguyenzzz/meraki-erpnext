import { Link } from "react-router";
import { Check } from "lucide-react";
import { formatIsoWeekday } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SOON_DAYS, type MyWedding } from "@/hooks/useMyWeddings";
import { StageBadge } from "@/pages/projects/weddings-list/WeddingBadges";
import { RoleBadge } from "@/pages/self-service/my-weddings/RoleBadge";

function DaysBlock({ wedding: w }: { wedding: MyWedding }) {
  const base = "flex h-[62px] w-[58px] shrink-0 flex-col items-center justify-center rounded-xl";
  if (w.finished) {
    return (
      <div className={cn(base, "bg-secondary text-muted-foreground")}>
        <Check className="h-[22px] w-[22px]" strokeWidth={2.2} aria-hidden />
        <span className="text-[11px] font-semibold">Done</span>
      </div>
    );
  }
  if (w.days_to_go == null) return <div className={cn(base, "bg-secondary text-muted-foreground")}><span className="text-[11px] font-semibold">No date</span></div>;
  return (
    <div className={cn(base, w.days_to_go <= SOON_DAYS ? "bg-accent text-accent-foreground" : "bg-muted text-foreground")}>
      <span className="font-display text-[28px] font-semibold leading-7 lining-nums tabular-nums">{w.days_to_go}</span>
      <span className="text-[11px] font-semibold">{w.days_to_go === 1 ? "day" : "days"}</span>
    </div>
  );
}

/** One assigned wedding as a tappable card (phones). */
export function WeddingRow({ wedding: w }: { wedding: MyWedding }) {
  const finished = w.finished;
  return (
    <Link
      to={`/my-weddings/${w.id}`}
      className={cn(
        "flex items-center gap-3 rounded-card border bg-card px-3.5 py-3 transition-colors hover:bg-accent/40",
        finished && "bg-muted/50",
        !finished && w.days_to_go != null && w.days_to_go <= SOON_DAYS && "border-primary/30"
      )}
    >
      <DaysBlock wedding={w} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <b className={cn("truncate text-base", finished && "text-muted-foreground")}>{w.project_name}</b>
        <span className="truncate text-[13px] text-muted-foreground tabular-nums">
          {[w.wedding_date ? formatIsoWeekday(w.wedding_date) : null, w.venue_name].filter(Boolean).join(" · ")}
        </span>
        <div className="flex flex-wrap gap-1.5">
          <RoleBadge role={w.my_role} />
          <StageBadge stage={w.stage} />
        </div>
      </div>
    </Link>
  );
}
