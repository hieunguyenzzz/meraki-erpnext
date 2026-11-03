import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { formatVNDFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ALLOWANCE_COMPONENT, BONUS_COMPONENT, buildBreakdown, roleLabel } from "./payslipBreakdown";
import type { MySlip } from "./types";

function Line({ label, amount, sub, strong }: { label: string; amount: number; sub?: boolean; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-3 py-1.5 text-sm tabular-nums", sub && "pl-4 text-xs", strong && "mt-1 border-t pt-2.5 font-semibold")}>
      <span className={cn(!strong && "text-muted-foreground")}>{label}</span>
      <span className="shrink-0">{formatVNDFull(amount)}</span>
    </div>
  );
}

export function PayslipTags({ slip }: { slip: MySlip }) {
  if (!slip.is_probation && slip.pit_method !== "Flat 10%") return null;
  return (
    <div className="flex flex-wrap gap-2">
      {slip.is_probation && <Badge variant="warning">Probation 85%</Badge>}
      {slip.pit_method === "Flat 10%" && <Badge variant="info">Flat 10% PIT</Badge>}
    </div>
  );
}

/** Earnings, deductions and net pay for one slip. */
export function PayslipBreakdownView({ slip, commissionComponents }: { slip: MySlip; commissionComponents: string[] }) {
  const b = useMemo(() => buildBreakdown(slip, commissionComponents), [slip, commissionComponents]);
  return (
    <div className="space-y-5">
      <PayslipTags slip={slip} />

      <section aria-label="Earnings">
        <h3 className="mb-1 text-sm font-semibold">Earnings</h3>
        {b.baseEarnings.map((e) => (
          <Line key={e.salary_component} label={e.salary_component} amount={e.amount} />
        ))}
        {b.commissionTotal > 0 && (
          <>
            <Line label="Commission" amount={b.commissionTotal} />
            {b.commissionLines.map((e) => (
              <Line key={e.salary_component} label={roleLabel(e.salary_component)} amount={e.amount} sub />
            ))}
          </>
        )}
        {b.allowance > 0 && <Line label={ALLOWANCE_COMPONENT} amount={b.allowance} />}
        <Line label={BONUS_COMPONENT} amount={b.bonus} />
        {b.prorationAdj !== 0 && <Line label="Proration / probation adjustment" amount={-b.prorationAdj} />}
        <Line label="Gross Pay" amount={slip.gross_pay} strong />
      </section>

      <section aria-label="Deductions">
        <h3 className="mb-1 text-sm font-semibold">Deductions</h3>
        {b.visibleDeductions.length === 0 ? (
          <p className="py-1.5 text-sm text-muted-foreground">No deductions</p>
        ) : (
          b.visibleDeductions.map((d) => <Line key={d.salary_component} label={d.salary_component} amount={d.amount} />)
        )}
        <Line label="Total Deductions" amount={b.totalDeductions} strong />
      </section>

      <div className="flex justify-between gap-3 rounded-card bg-accent px-4 py-3 text-base font-bold tabular-nums text-accent-foreground">
        <span>Net Pay</span>
        <span>{formatVNDFull(slip.net_pay)}</span>
      </div>
    </div>
  );
}
