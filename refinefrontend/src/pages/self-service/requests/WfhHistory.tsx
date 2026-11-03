import { Badge } from "@/components/ui/badge";
import { dateRange, wfhStatus, type WfhRequest } from "./types";

/** Days spanned, counted exactly as before (calendar days, inclusive). */
function wfhDays(r: WfhRequest) {
  const from = new Date(r.from_date);
  const to = new Date(r.to_date);
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

function StatusBadge({ docstatus }: { docstatus: number }) {
  const s = wfhStatus(docstatus);
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export function WfhHistory({ requests, desktop }: { requests: WfhRequest[]; desktop: boolean }) {
  if (desktop) {
    return (
      <div className="overflow-x-auto rounded-card border bg-card">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead className="bg-muted text-left text-[13px] text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">Dates</th>
              <th className="px-4 py-3 text-right font-semibold">Days</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Notes</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.name} className="border-t align-middle">
                <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums">{dateRange(r.from_date, r.to_date)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{wfhDays(r)}</td>
                <td className="px-4 py-3"><StatusBadge docstatus={r.docstatus} /></td>
                <td className="max-w-[320px] truncate px-4 py-3 text-muted-foreground" title={r.explanation || undefined}>{r.explanation || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2.5">
      {requests.map((r) => (
        <li key={r.name} className="flex flex-col gap-2 rounded-card border bg-card p-4">
          <div className="flex items-center gap-3">
            <b className="min-w-0 flex-1 tabular-nums">{dateRange(r.from_date, r.to_date)}</b>
            <StatusBadge docstatus={r.docstatus} />
          </div>
          <span className="text-sm text-muted-foreground">{wfhDays(r)} day{wfhDays(r) === 1 ? "" : "s"}</span>
          {r.explanation && <p className="rounded-xl bg-muted px-3 py-2.5 text-sm text-foreground/80">{r.explanation}</p>}
        </li>
      ))}
    </ul>
  );
}
