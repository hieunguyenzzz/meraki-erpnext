import { formatVNDCompact, formatVNDFull } from "@/lib/format";
import type { SalarySlip } from "./types";

function Tile({ label, value, full }: { label: string; value: string; full?: string }) {
  return (
    <div className="rounded-card border bg-card p-4">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums md:text-2xl" title={full}>{value}</p>
    </div>
  );
}

/** Month totals of figures the backend already computed per slip (plain sums of the rows shown). */
export function PayrollSummary({ slips }: { slips: SalarySlip[] }) {
  const sum = (f: (s: SalarySlip) => number) => slips.reduce((t, s) => t + f(s), 0);
  const gross = sum((s) => s.gross_pay);
  const net = sum((s) => s.net_pay);
  const employer = sum((s) => s.employer_bhxh ?? 0);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile label="Employees" value={String(slips.length)} />
      <Tile label="Total gross pay" value={formatVNDCompact(gross)} full={formatVNDFull(gross)} />
      <Tile label="Total net pay" value={formatVNDCompact(net)} full={formatVNDFull(net)} />
      <Tile label="Employer BHXH" value={formatVNDCompact(employer)} full={formatVNDFull(employer)} />
    </div>
  );
}
