import { Badge } from "@/components/ui/badge";
import { BonusCell } from "@/components/payroll/BonusCell";
import { formatVNDFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PAYROLL_COLUMNS } from "./columns";
import { docstatusBadge, docstatusLabel, type SalarySlip } from "./types";

const dash = <span className="text-muted-foreground">-</span>;

/** One money cell, styled as before (muted deductions, gold employer cost, red tax). Bonus is click-to-edit on draft slips. */
export function PayrollCell({ colId, slip, weddingAllowance, onSetBonus, touch }: {
  colId: string;
  slip: SalarySlip;
  weddingAllowance: number;
  onSetBonus: (employee: string, amount: number) => Promise<boolean>;
  touch?: boolean;
}) {
  const col = PAYROLL_COLUMNS.find((c) => c.id === colId);
  if (!col) return null;
  const v = col.value(slip, weddingAllowance);
  switch (colId) {
    case "bonus":
      return <BonusCell touch={touch} amount={v} editable={slip.docstatus === 0} onSave={(a) => onSetBonus(slip.employee, a)} />;
    case "wedding_allowance":
      return <>{v > 0 ? formatVNDFull(v) : dash}</>;
    case "si_employee":
    case "tax_reduction":
      return <span className="text-muted-foreground">{formatVNDFull(v)}</span>;
    case "employer_bhxh":
      return <span className="text-warning">{formatVNDFull(v)}</span>;
    case "dependents":
      return <>{v > 0 ? v : <span className="text-muted-foreground">0</span>}</>;
    case "taxable_income":
      return <span className={cn(v < 0 && "text-muted-foreground")}>{formatVNDFull(v)}</span>;
    case "est_pit":
      return v > 0 ? <span className="text-destructive">{formatVNDFull(v)}</span> : dash;
    case "net_pay":
      return <b className="font-semibold">{formatVNDFull(v)}</b>;
    default:
      return <>{formatVNDFull(v)}</>;
  }
}

/** "85%" (probation) and "10% PIT" (flat tax) tags; small and never wrapping (MWP-89). */
export function SlipTags({ slip }: { slip: SalarySlip }) {
  const flat = slip.pit_method === "Flat 10%";
  if (!slip.is_probation && !flat) return null;
  return (
    <span className="flex gap-1">
      {slip.is_probation && <Badge variant="warning" className="whitespace-nowrap px-1.5 py-0 text-[10px] leading-4">85%</Badge>}
      {flat && <Badge variant="info" className="whitespace-nowrap px-1.5 py-0 text-[10px] leading-4">10% PIT</Badge>}
    </span>
  );
}

export function SlipStatus({ slip }: { slip: SalarySlip }) {
  return <Badge variant={docstatusBadge(slip.docstatus)}>{docstatusLabel(slip.docstatus)}</Badge>;
}
