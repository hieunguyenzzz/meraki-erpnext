import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { RatingStars } from "@/components/recruiting/RatingStars";
import { STAGE_BADGE } from "@/components/recruiting/stageBadge";
import { stageOf, type ApplicantRow } from "./types";

/** Phone list, M-Venues style: one rounded card per applicant, with a 48px select target. */
export function ApplicantCards({ rows, selected, onToggle }: { rows: ApplicantRow[]; selected: Set<string>; onToggle: (name: string, on: boolean) => void }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((a) => {
        const stage = stageOf(a);
        const name = a.applicant_name || a.name;
        return (
          <li key={a.name} className="flex items-stretch rounded-2xl border bg-card text-card-foreground">
            <label className="flex w-12 shrink-0 items-center justify-center">
              <span className="sr-only">Select {name}</span>
              <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary-fill))]" checked={selected.has(a.name)} onChange={(e) => onToggle(a.name, e.target.checked)} />
            </label>
            <Link to={`/hr/recruiting/${a.name}`} className="flex min-h-[72px] min-w-0 flex-1 items-center gap-3 rounded-r-2xl py-3 pr-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <StaffAvatar name={name} id={a.name} className="h-10 w-10 text-sm" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <b className="truncate text-base">{name}</b>
                <span className="truncate text-[13px] text-muted-foreground">{[a.job_title, a.source].filter(Boolean).join(" · ") || "-"}</span>
                <span className="text-[13px] tabular-nums text-muted-foreground">Applied {a.creation.slice(0, 10)}</span>
                <RatingStars value={a.applicant_rating} />
              </div>
              <Badge variant={STAGE_BADGE[stage] ?? "secondary"} className="shrink-0 self-start">{stage}</Badge>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
