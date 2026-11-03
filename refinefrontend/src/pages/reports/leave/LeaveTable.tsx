import { Badge } from "@/components/ui/badge";
import { MONTHS, balanceVariant, dayLabel, type LeaveReportRow } from "./types";

const GROUP = "bg-muted/60";

function Head({ year, className = "", children }: { year: number | null; className?: string; children: string }) {
  return (
    <th scope="col" className={`px-2 py-3 text-center text-[13px] font-semibold leading-tight ${className}`}>
      {year !== null && <span className="block text-xs font-normal">{year}</span>}
      {children}
    </th>
  );
}

/** Desktop layout (D-Reports.dc.html): sticky header and employee column, scrolls inside its own frame. */
export function LeaveTable({ rows, year, showAllocation }: { rows: LeaveReportRow[]; year: number; showAllocation: boolean }) {
  return (
    <section className="overflow-hidden rounded-card border bg-card">
      <div className="max-h-[calc(100vh-24rem)] min-h-[16rem] overflow-auto">
        <table aria-label="Leave report" className="w-full min-w-[1000px] border-collapse text-sm tabular-nums">
          <thead className="sticky top-0 z-20 bg-muted text-muted-foreground">
            <tr>
              <th scope="col" className="sticky left-0 z-30 min-w-[180px] bg-muted px-3 py-3 text-left text-[13px] font-semibold">Employee</th>
              {MONTHS.map((m) => <Head key={m} year={null} className="min-w-[40px] !px-1">{m}</Head>)}
              <Head year={year - 1} className={GROUP}>Left over</Head>
              <Head year={year - 1} className={GROUP}>Taken</Head>
              <Head year={year - 1} className={GROUP}>Balance</Head>
              <Head year={year}>Usable</Head>
              <Head year={year}>Taken</Head>
              <Head year={year}>Balance</Head>
              <Head year={null} className={GROUP}>Total balance</Head>
              {showAllocation && <Head year={year}>Allocation</Head>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employee} className="border-t hover:bg-muted/40">
                <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-2.5 text-left font-medium">{r.employee_name}</th>
                {r.monthly_leave.map((d, i) => (
                  <td key={i} className="px-1 py-2.5 text-center">
                    {d > 0 && (
                      <span className="inline-flex h-7 min-w-7 items-center justify-center rounded bg-warning-soft px-1 text-xs font-semibold text-warning-soft-foreground">
                        {dayLabel(d)}
                      </span>
                    )}
                  </td>
                ))}
                <td className={`px-2 py-2.5 text-center ${GROUP}`}>{r.old_allocation_days}</td>
                <td className={`px-2 py-2.5 text-center ${GROUP}`}>{r.old_taken > 0 ? r.old_taken : "-"}</td>
                <td className={`px-2 py-2.5 text-center ${GROUP}`}><Badge variant={balanceVariant(r.old_balance)}>{r.old_balance}</Badge></td>
                <td className="px-2 py-2.5 text-center"><Badge variant={r.new_usable > 0 ? "success" : "secondary"}>{r.new_usable}</Badge></td>
                <td className="px-2 py-2.5 text-center">{r.new_taken > 0 ? r.new_taken : "-"}</td>
                <td className="px-2 py-2.5 text-center"><Badge variant={balanceVariant(r.new_balance)}>{r.new_balance}</Badge></td>
                <td className={`px-2 py-2.5 text-center ${GROUP}`}><Badge variant={balanceVariant(r.total_balance)}>{r.total_balance}</Badge></td>
                {showAllocation && <td className="px-2 py-2.5 text-center">{r.new_allocation_days}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
