export interface MonthRow {
  month: string;
  revenue: number;
  expenses: number;
  net: number;
  collected: number;
  weddings: number;
}

export interface OverviewTotals {
  revenue: number;
  expenses: number;
  net: number;
  collected: number;
  outstanding_receivables: number;
  outstanding_invoices_count: number;
  active_pipeline: number;
  active_weddings_count: number;
}

export interface OverviewData {
  year: number | "all";
  available_years: number[];
  months: MonthRow[];
  totals: OverviewTotals;
}
