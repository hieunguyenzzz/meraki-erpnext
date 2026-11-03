import type { MySlip, SlipLine } from "./types";

// Already netted out of gross_pay by the backend; showing it again as a
// deduction line would double count it.
const HIDDEN_DEDUCTION_COMPONENTS = ["Salary Proration Adj"];
export const ALLOWANCE_COMPONENT = "Wedding Allowance";
export const BONUS_COMPONENT = "Bonus";

function getAmount(lines: SlipLine[], component: string): number {
  return lines.find((l) => l.salary_component === component)?.amount ?? 0;
}

/** Short labels for the indented commission role lines. */
export function roleLabel(component: string): string {
  return component.replace(/ Commission$/, "");
}

/** Month as ISO YYYY-MM, from the slip's start date. */
export function monthIso(slip: MySlip): string {
  return slip.start_date.slice(0, 7);
}

export interface PayslipBreakdown {
  baseEarnings: SlipLine[];
  commissionLines: SlipLine[];
  commissionTotal: number;
  allowance: number;
  bonus: number;
  prorationAdj: number;
  visibleDeductions: SlipLine[];
  totalDeductions: number;
}

/**
 * Same derivation as the previous page (no new maths).
 * gross_pay from the backend is already net of "Salary Proration Adj" (a
 * deduction ERPNext applies for prorated/probation slips). To keep the
 * breakdown reconciling (sum(earnings) === Gross, Gross - Total Deductions
 * === Net Pay) that adjustment moves out of Deductions into a negative
 * Earnings line, and the visible deduction lines are totalled here rather
 * than trusting the raw total_deduction (which still includes proration).
 */
export function buildBreakdown(slip: MySlip, commissionComponents: string[]): PayslipBreakdown {
  const prorationAdj = getAmount(slip.deductions, "Salary Proration Adj");
  const visibleDeductions = slip.deductions.filter((d) => !HIDDEN_DEDUCTION_COMPONENTS.includes(d.salary_component));
  const isSpecial = (c: string) => commissionComponents.includes(c) || c === ALLOWANCE_COMPONENT || c === BONUS_COMPONENT;
  const commissionLines = slip.earnings.filter((e) => commissionComponents.includes(e.salary_component) && e.amount !== 0);
  return {
    baseEarnings: slip.earnings.filter((e) => !isSpecial(e.salary_component)),
    commissionLines,
    commissionTotal: commissionLines.reduce((sum, e) => sum + e.amount, 0),
    allowance: getAmount(slip.earnings, ALLOWANCE_COMPONENT),
    bonus: getAmount(slip.earnings, BONUS_COMPONENT),
    prorationAdj,
    visibleDeductions,
    totalDeductions: visibleDeductions.reduce((sum, d) => sum + d.amount, 0),
  };
}
