export interface SlipLine {
  salary_component: string;
  amount: number;
}

export interface MySlip {
  name: string;
  employee: string;
  employee_display_name: string;
  start_date: string;
  end_date: string;
  posting_date: string;
  payroll_entry: string;
  gross_pay: number;
  total_deduction: number;
  net_pay: number;
  earnings: SlipLine[];
  deductions: SlipLine[];
  si_employee?: number;
  is_probation?: boolean;
  pit_method?: string;
}

export interface MySlipsResponse {
  employee: { name: string; display_name: string } | null;
  commission_components: string[];
  data: MySlip[];
}
