import { Badge } from "@/components/ui/badge";
import { MONTHS, balanceVariant, dayLabel, type LeaveReportRow } from "./types";

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

/** Phone layout: one card per employee, total balance first. */
export function LeaveCard({ r, year, showAllocation }: { r: LeaveReportRow; year: number; showAllocation: boolean }) {
  const months = r.monthly_leave.map((d, i) => ({ d, m: MONTHS[i] })).filter((x) => x.d > 0);
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-card border bg-card p-4 tabular-nums">
      <div className="flex items-center justify-between gap-2">
        <b className="truncate">{r.employee_name}</b>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          Total balance <Badge variant={balanceVariant(r.total_balance)}>{r.total_balance}</Badge>
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <Stat label={`${year - 1} left over`}>{r.old_allocation_days}</Stat>
        <Stat label={`${year - 1} taken`}>{r.old_taken > 0 ? r.old_taken : "-"}</Stat>
        <Stat label={`${year - 1} balance`}><Badge variant={balanceVariant(r.old_balance)}>{r.old_balance}</Badge></Stat>
        <Stat label={`${year} usable`}><Badge variant={r.new_usable > 0 ? "success" : "secondary"}>{r.new_usable}</Badge></Stat>
        <Stat label={`${year} taken`}>{r.new_taken > 0 ? r.new_taken : "-"}</Stat>
        <Stat label={`${year} balance`}><Badge variant={balanceVariant(r.new_balance)}>{r.new_balance}</Badge></Stat>
        {showAllocation && <Stat label={`${year} allocation`}>{r.new_allocation_days}</Stat>}
      </dl>
      <div className="flex flex-wrap items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
        {months.length === 0 ? (
          <span>No leave taken in {year}</span>
        ) : (
          months.map(({ d, m }) => (
            <span key={m} className="inline-flex items-center gap-1 rounded bg-warning-soft px-1.5 py-0.5 font-semibold text-warning-soft-foreground">
              {m} <span>{dayLabel(d)}</span>
            </span>
          ))
        )}
      </div>
    </article>
  );
}
