import { useState, useEffect } from "react";
import {
  ComposedChart, BarChart, Bar, AreaChart, Area, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, DollarSign, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatVND } from "@/lib/format";

interface MonthRow {
  month: string;
  revenue: number;
  expenses: number;
  net: number;
  collected: number;
  weddings: number;
}

interface OverviewTotals {
  revenue: number;
  expenses: number;
  net: number;
  collected: number;
  outstanding_receivables: number;
  outstanding_invoices_count: number;
  active_pipeline: number;
  active_weddings_count: number;
}

interface OverviewData {
  year: number;
  available_years: number[];
  months: MonthRow[];
  totals: OverviewTotals;
}

export default function DirectorSection() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [data, setData] = useState<OverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    fetch(`/inquiry-api/financial-overview?year=${selectedYear}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [selectedYear]);

  const availableYears = data?.available_years ?? [currentYear];
  const monthlyData = data?.months ?? [];
  const totals = data?.totals ?? {
    revenue: 0, expenses: 0, net: 0, collected: 0,
    outstanding_receivables: 0, outstanding_invoices_count: 0,
    active_pipeline: 0, active_weddings_count: 0,
  };

  const isCurrentYear = selectedYear === currentYear;
  const kpiLabel = isCurrentYear ? "YTD" : String(selectedYear);

  const yearSelector = (
    <Select
      value={String(selectedYear)}
      onValueChange={(v) => setSelectedYear(parseInt(v))}
    >
      <SelectTrigger className="h-7 w-24 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {availableYears.map((y) => (
          <SelectItem key={y} value={String(y)}>
            {y}{y === currentYear ? " (now)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-6">
      {/* Row 1: KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Revenue {kpiLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-[120px]" />
            ) : (
              <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                {formatVND(totals.revenue)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              Expenses {kpiLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-[120px]" />
            ) : (
              <div className="text-2xl font-bold text-red-700 dark:text-red-400">
                {formatVND(totals.expenses)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {totals.net >= 0
                ? <TrendingUp className="h-4 w-4 text-green-600" />
                : <TrendingDown className="h-4 w-4 text-red-600" />}
              Net Profit {kpiLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-[120px]" />
            ) : (
              <div className={`text-2xl font-bold ${totals.net >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                {formatVND(totals.net)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Collected {kpiLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-[120px]" />
            ) : (
              <div className="text-2xl font-bold">
                {formatVND(totals.collected)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Combined monthly overview chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Weddings, Revenue & Expenses by Month</CardTitle>
          {!isLoading && yearSelector}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={monthlyData}>
                <XAxis dataKey="month" fontSize={11} tickFormatter={(v) => v.substring(5)} />
                <YAxis
                  yAxisId="money"
                  orientation="left"
                  fontSize={11}
                  tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(0)}M`}
                />
                <YAxis
                  yAxisId="count"
                  orientation="right"
                  fontSize={11}
                  allowDecimals={false}
                  tickFormatter={(v: number) => `${v}`}
                />
                <Tooltip
                  formatter={(value: number, name: string) =>
                    name === "Weddings" ? [value, name] : [formatVND(value), name]
                  }
                />
                <Legend />
                <Bar yAxisId="money" dataKey="revenue" name="Revenue" fill="hsl(var(--chart-revenue))" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="money" dataKey="expenses" name="Expenses" fill="hsl(var(--chart-expenses))" radius={[4, 4, 0, 0]} />
                <Line
                  yAxisId="count"
                  type="monotone"
                  dataKey="weddings"
                  name="Weddings"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "hsl(var(--primary))" }}
                  activeDot={{ r: 6 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Row 3: Revenue vs Expenses + Net Profit */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Revenue vs Expenses ({selectedYear})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlyData}>
                  <XAxis dataKey="month" fontSize={11} tickFormatter={(v) => v.substring(5)} />
                  <YAxis fontSize={11} tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(0)}M`} />
                  <Tooltip formatter={(v: number) => formatVND(v)} />
                  <Legend />
                  <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--chart-revenue))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="hsl(var(--chart-expenses))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Net Profit Trend ({selectedYear})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={monthlyData}>
                  <XAxis dataKey="month" fontSize={11} tickFormatter={(v) => v.substring(5)} />
                  <YAxis fontSize={11} tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(0)}M`} />
                  <Tooltip formatter={(v: number) => formatVND(v)} />
                  <ReferenceLine y={0} strokeDasharray="3 3" stroke="hsl(var(--muted-foreground))" />
                  <Area
                    dataKey="net"
                    name="Net Profit"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.15}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Stat Cards */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-orange-500" />
              Outstanding Receivables
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <div>
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {formatVND(totals.outstanding_receivables)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {totals.outstanding_invoices_count} invoice{totals.outstanding_invoices_count !== 1 ? "s" : ""} with balance due
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              Active Weddings (Pipeline)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <div>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {formatVND(totals.active_pipeline)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {totals.active_weddings_count} upcoming wedding{totals.active_weddings_count !== 1 ? "s" : ""}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
