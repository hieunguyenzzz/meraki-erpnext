import { getDeductionAmount, getEarningAmount, getTotalCommission, type SalarySlip } from "./types";

/** One payroll figure per column, read straight from the slip the backend computed (no maths here). */
export interface PayrollColumn {
  id: string;
  label: string;
  /** Value used for sorting and display. */
  value: (s: SalarySlip, weddingAllowance: number) => number;
}

export const PAYROLL_COLUMNS: PayrollColumn[] = [
  { id: "base", label: "Base", value: (s) => getEarningAmount(s.earnings, "Basic Salary") },
  { id: "commission", label: "Commission", value: (s) => getTotalCommission(s.earnings) },
  { id: "wedding_allowance", label: "Wedding Allowance", value: (_s, wa) => wa },
  { id: "bonus", label: "Bonus", value: (s) => getEarningAmount(s.earnings, "Bonus") },
  { id: "gross_pay", label: "Gross Pay", value: (s) => s.gross_pay },
  { id: "si_employee", label: "SI 10.5%", value: (s) => s.si_employee ?? 0 },
  { id: "employer_bhxh", label: "Employer BHXH", value: (s) => s.employer_bhxh ?? 0 },
  { id: "dependents", label: "Dependents", value: (s) => s.dependents ?? 0 },
  { id: "tax_reduction", label: "Tax Reduction", value: (s) => s.tax_reduction ?? 0 },
  { id: "taxable_income", label: "Taxable Income", value: (s) => s.taxable_income ?? 0 },
  { id: "est_pit", label: "Income Tax", value: (s) => getDeductionAmount(s.deductions, "Income Tax") },
  { id: "net_pay", label: "Net Pay", value: (s) => s.net_pay },
];
