export interface SalarySlipEarning {
  salary_component: string;
  amount: number;
}

export interface SalarySlip {
  name: string;
  modified?: string;
  employee: string;
  employee_name: string;
  employee_display_name?: string;
  dependents?: number;
  gross_pay: number;
  total_deduction: number;
  net_pay: number;
  posting_date: string;
  docstatus: number;
  earnings: SalarySlipEarning[];
  deductions: SalarySlipEarning[];
  // Pre-computed by backend
  si_employee?: number;
  employer_bhxh?: number;
  tax_reduction?: number;
  taxable_income?: number;
  is_probation?: boolean;
  pit_method?: string;
}

export interface PayrollEntry {
  name: string;
  posting_date: string;
  start_date: string;
  end_date: string;
  docstatus: number;
  status: string;
  number_of_employees: number;
}

export function docstatusLabel(ds: number) {
  return ds === 0 ? "Draft" : ds === 1 ? "Submitted" : ds === 2 ? "Cancelled" : "Unknown";
}

export function docstatusBadge(ds: number) {
  return ds === 1 ? ("success" as const) : ds === 2 ? ("destructive" as const) : ("secondary" as const);
}

export function getEarningAmount(earnings: SalarySlipEarning[] | undefined, component: string): number {
  return earnings?.find((e) => e.salary_component === component)?.amount ?? 0;
}

export function getTotalCommission(earnings: SalarySlipEarning[] | undefined): number {
  const commissionComponents = ["Assistant Commission", "Support Planner Commission", "Lead Planner Commission", "Full Package Commission", "Partial Package Commission"];
  return earnings?.filter((e) => commissionComponents.includes(e.salary_component))
    .reduce((sum, e) => sum + e.amount, 0) ?? 0;
}

export function getDeductionAmount(deductions: SalarySlipEarning[] | undefined, component: string): number {
  return deductions?.find((e) => e.salary_component === component)?.amount ?? 0;
}

export function slipName(s: SalarySlip): string {
  return s.employee_display_name || s.employee_name;
}

export interface CommissionRow {
  name: string;
  lead: number;
  support: number;
  assistant: number;
  fullPkg: number;
  partialPkg: number;
  total: number;
}

/** Commission split for one slip, or null when it has none (same split the page always showed). */
export function commissionOf(s: SalarySlip): CommissionRow | null {
  const lead = getEarningAmount(s.earnings, "Lead Planner Commission");
  const support = getEarningAmount(s.earnings, "Support Planner Commission");
  const assistant = getEarningAmount(s.earnings, "Assistant Commission");
  const fullPkg = getEarningAmount(s.earnings, "Full Package Commission");
  const partialPkg = getEarningAmount(s.earnings, "Partial Package Commission");
  const total = lead + support + assistant + fullPkg + partialPkg;
  if (total === 0) return null;
  return { name: slipName(s), lead, support, assistant, fullPkg, partialPkg, total };
}
