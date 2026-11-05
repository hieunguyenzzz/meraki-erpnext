import { formatMillionsPlain } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MonthRow } from "@/components/dashboard/financialOverview";

/** Phone month table in millions of VND, newest month first. */
export function MobileMonthTable({ months }: { months: MonthRow[] }) {
  const rows = [...months].reverse();
  const num = "px-1.5 py-[9px] text-right text-[13px] tabular-nums";
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <table className="w-full border-collapse">
        <caption className="sr-only">Monthly weddings, revenue, expenses and net profit in VND millions</caption>
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th scope="col" className="py-[9px] pl-3.5 pr-1.5 text-left text-[13px] font-medium">Month</th>
            <th scope="col" className={cn(num, "font-medium")}>Wed.</th>
            <th scope="col" className={cn(num, "font-medium")}>Rev. M</th>
            <th scope="col" className={cn(num, "font-medium")}>Exp. M</th>
            <th scope="col" className={cn(num, "pr-3.5 font-medium")}>Net M</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month} className="border-t">
              <td className="py-[9px] pl-3.5 pr-1.5 text-left text-[13px] tabular-nums">{r.month}</td>
              <td className={num}>{r.weddings}</td>
              <td className={num}>{formatMillionsPlain(r.revenue)}</td>
              <td className={num}>{formatMillionsPlain(r.expenses)}</td>
              <td className={cn(num, "pr-3.5 font-bold", r.net < 0 && "text-destructive")}>{formatMillionsPlain(r.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
