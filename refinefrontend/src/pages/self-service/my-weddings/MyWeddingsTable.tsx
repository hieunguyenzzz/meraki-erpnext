import { Link } from "react-router";
import { formatIsoWeekday } from "@/lib/format";
import { SOON_DAYS, type MyWedding } from "@/hooks/useMyWeddings";
import { StageBadge } from "@/pages/projects/weddings-list/WeddingBadges";
import { RoleBadge } from "./RoleBadge";

const HEAD = "px-4 py-3 text-left text-[13px] font-semibold text-muted-foreground whitespace-nowrap";
const CELL = "whitespace-nowrap border-t px-4 py-3.5 text-sm tabular-nums";

/** Assigned weddings as a table (desktop). */
export function MyWeddingsTable({ weddings }: { weddings: MyWedding[] }) {
  return (
    <section className="overflow-hidden rounded-card border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] table-fixed border-collapse">
          <thead className="bg-muted">
            <tr>
              <th className={`${HEAD} w-[30%]`}>Couple</th><th className={`${HEAD} w-[16%]`}>Date</th><th className={`${HEAD} w-[12%]`}>Days to go</th>
              <th className={`${HEAD} w-[16%]`}>Venue</th><th className={`${HEAD} w-[13%]`}>Stage</th><th className={`${HEAD} w-[13%]`}>My role</th>
            </tr>
          </thead>
          <tbody>
            {weddings.map((w) => {
              const finished = w.finished;
              return (
                <tr key={w.id} className={finished ? "text-muted-foreground" : undefined}>
                  <td className={`${CELL} truncate`}><Link to={`/my-weddings/${w.id}`} className="font-bold text-foreground hover:underline">{w.project_name}</Link></td>
                  <td className={CELL}>{w.wedding_date ? formatIsoWeekday(w.wedding_date) : "-"}</td>
                  <td className={CELL}>{finished ? "Done" : w.days_to_go == null ? "-" : <b className={w.days_to_go <= SOON_DAYS ? "text-accent-foreground" : undefined}>{w.days_to_go}</b>}</td>
                  <td className={CELL}>{w.venue_name || "-"}</td>
                  <td className={CELL}><StageBadge stage={w.stage} /></td>
                  <td className={CELL}><RoleBadge role={w.my_role} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
