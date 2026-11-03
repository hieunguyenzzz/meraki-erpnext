import { Link } from "react-router";
import { MoreHorizontal } from "lucide-react";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { displayName } from "@/lib/format";
import { StatusBadge } from "./StaffBadges";
import type { StaffRow } from "./types";

interface Props {
  rows: StaffRow[];
  onActions: (row: StaffRow) => void;
}

/** Phone staff list: one card per person (name, title, status); actions open a sheet. */
export function StaffCards({ rows, onActions }: Props) {
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => {
        const name = displayName(r);
        return (
          <li key={r.name} className="flex items-stretch rounded-2xl border bg-card text-card-foreground">
            <Link
              to={`/hr/employees/${r.name}`}
              className="flex min-h-[72px] min-w-0 flex-1 items-center gap-3 rounded-l-2xl p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <StaffAvatar name={name} id={r.name} className="h-10 w-10 text-sm" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <b className="truncate text-base">{name}</b>
                <span className="truncate text-[13px] text-muted-foreground">
                  {[r.designation, r.department].filter((v) => v && v !== "-").join(" · ") || "-"}
                </span>
                <div><StatusBadge row={r} /></div>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => onActions(r)}
              aria-label={`Actions for ${name}`}
              className="flex w-12 shrink-0 items-center justify-center rounded-r-2xl text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
