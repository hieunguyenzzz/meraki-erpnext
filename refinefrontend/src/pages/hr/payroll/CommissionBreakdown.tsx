import { formatVNDFull } from "@/lib/format";
import type { CommissionRow } from "./types";

const money = (n: number) => (n > 0 ? formatVNDFull(n) : "-");

/** Desktop commission split per employee, shown under the table. */
export function CommissionBreakdown({ rows }: { rows: CommissionRow[] }) {
  if (rows.length === 0) return null;
  const hasFullPkg = rows.some((r) => r.fullPkg > 0);
  const hasPartialPkg = rows.some((r) => r.partialPkg > 0);
  return (
    <section className="text-xs text-muted-foreground">
      <h2 className="mb-1 font-medium">Commission Breakdown</h2>
      <div className="overflow-x-auto">
        <table className="w-auto tabular-nums">
          <thead>
            <tr className="text-left">
              <th scope="col" className="pr-4 font-normal">Employee</th>
              <th scope="col" className="pr-4 text-right font-normal">Lead</th>
              <th scope="col" className="pr-4 text-right font-normal">Support</th>
              <th scope="col" className="pr-4 text-right font-normal">Assistant</th>
              {hasFullPkg && <th scope="col" className="pr-4 text-right font-normal">Full Pkg</th>}
              {hasPartialPkg && <th scope="col" className="pr-4 text-right font-normal">Partial Pkg</th>}
              <th scope="col" className="text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="pr-4">{r.name}</td>
                <td className="pr-4 text-right">{money(r.lead)}</td>
                <td className="pr-4 text-right">{money(r.support)}</td>
                <td className="pr-4 text-right">{money(r.assistant)}</td>
                {hasFullPkg && <td className="pr-4 text-right">{money(r.fullPkg)}</td>}
                {hasPartialPkg && <td className="pr-4 text-right">{money(r.partialPkg)}</td>}
                <td className="text-right">{formatVNDFull(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
