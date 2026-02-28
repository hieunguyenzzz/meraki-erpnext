import { useMemo, useState } from "react";
import { useList } from "@refinedev/core";
import {
  ComposedChart, BarChart, Bar, AreaChart, Area, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, DollarSign, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatVND } from "@/lib/format";

export default function DirectorSection() {
  const { result: invoicesResult, query: invoicesQuery } = useList({
    resource: "Sales Invoice",
    pagination: { mode: "off" },
    filters: [{ field: "docstatus", operator: "eq", value: 1 }],
    meta: { fields: ["posting_date", "grand_total", "outstanding_amount"] },
  });

  const { result: journalsResult, query: journalsQuery } = useList({
    resource: "Journal Entry",
    pagination: { mode: "off" },
    filters: [{ field: "docstatus", operator: "eq", value: 1 }],
    meta: { fields: ["posting_date", "total_debit"] },
  });

  const { result: paymentsResult, query: paymentsQuery } = useList({
    resource: "Payment Entry",
    pagination: { mode: "off" },
    filters: [
      { field: "docstatus", operator: "eq", value: 1 },
      { field: "payment_type", operator: "eq", value: "Receive" },
    ],
    meta: { fields: ["posting_date", "paid_amount"] },
  });

  const { result: ordersResult, query: ordersQuery } = useList({
    resource: "Sales Order",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "eq", value: "Open" }],
    meta: { fields: ["name", "grand_total", "delivery_date"] },
  });

  const { result: allOrdersResult, query: allOrdersQuery } = useList({
    resource: "Sales Order",
    pagination: { mode: "off" },
    filters: [{ field: "docstatus", operator: "eq", value: 1 }],
    meta: { fields: ["delivery_date"] },
  });

  const isLoading =
    invoicesQuery?.isLoading ||
    journalsQuery?.isLoading ||
    paymentsQuery?.isLoading ||
    ordersQuery?.isLoading ||
    allOrdersQuery?.isLoading;

  const invoices = (invoicesResult?.data ?? []) as any[];
  const journals = (journalsResult?.data ?? []) as any[];
  const payments = (paymentsResult?.data ?? []) as any[];
  const orders = (ordersResult?.data ?? []) as any[];
  const allOrders = (allOrdersResult?.data ?? []) as any[];

  const currentYear = new Date().getFullYear();
  const today = new Date().toISOString().split("T")[0];

  // Derive available years from all data, always include current year
  const availableYears = useMemo(() => {
    const years = new Set<number>([currentYear]);
    for (const inv of invoices) {
      const y = inv.posting_date?.substring(0, 4);
      if (y) years.add(parseInt(y));
    }
    for (const j of journals) {
      const y = j.posting_date?.substring(0, 4);
      if (y) years.add(parseInt(y));
    }
    for (const so of allOrders) {
      const y = so.delivery_date?.substring(0, 4);
      if (y) years.add(parseInt(y));
    }
    return Array.from(years).sort((a, b) => b - a); // newest first
  }, [invoices, journals, allOrders, currentYear]);

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  // Jan–Dec months for the selected year
  const yearMonths = useMemo(() =>
    Array.from({ length: 12 }, (_, i) =>
      `${selectedYear}-${String(i + 1).padStart(2, "0")}`
    ),
    [selectedYear]
  );

  const monthlyData = useMemo(() => {
    const map = new Map<string, { revenue: number; expenses: number; collected: number }>();
    for (const month of yearMonths) map.set(month, { revenue: 0, expenses: 0, collected: 0 });

    for (const inv of invoices) {
      const month = inv.posting_date?.substring(0, 7);
      if (!month || !map.has(month)) continue;
      map.get(month)!.revenue += inv.grand_total ?? 0;
    }
    for (const j of journals) {
      const month = j.posting_date?.substring(0, 7);
      if (!month || !map.has(month)) continue;
      map.get(month)!.expenses += j.total_debit ?? 0;
    }
    for (const p of payments) {
      const month = p.posting_date?.substring(0, 7);
      if (!month || !map.has(month)) continue;
      map.get(month)!.collected += p.paid_amount ?? 0;
    }

    return yearMonths.map((month) => {
      const data = map.get(month)!;
      return { month, ...data, net: data.revenue - data.expenses };
    });
  }, [invoices, journals, payments, yearMonths]);

  const combinedMonthlyData = useMemo(() => {
    const weddingCount = new Map<string, number>();
    for (const month of yearMonths) weddingCount.set(month, 0);
    for (const so of allOrders) {
      const month = so.delivery_date?.substring(0, 7);
      if (!month || !weddingCount.has(month)) continue;
      weddingCount.set(month, (weddingCount.get(month) ?? 0) + 1);
    }
    return monthlyData.map((row) => ({
      ...row,
      weddings: weddingCount.get(row.month) ?? 0,
    }));
  }, [monthlyData, allOrders, yearMonths]);

  // KPI totals for selected year
  const yearTotals = useMemo(() => {
    const prefix = String(selectedYear);
    let revenue = 0, expenses = 0, collected = 0;
    for (const inv of invoices) {
      if (inv.posting_date?.startsWith(prefix)) revenue += inv.grand_total ?? 0;
    }
    for (const j of journals) {
      if (j.posting_date?.startsWith(prefix)) expenses += j.total_debit ?? 0;
    }
    for (const p of payments) {
      if (p.posting_date?.startsWith(prefix)) collected += p.paid_amount ?? 0;
    }
    return { revenue, expenses, net: revenue - expenses, collected };
  }, [invoices, journals, payments, selectedYear]);

  const outstandingInvoices = useMemo(() =>
    invoices.filter((inv) => (inv.outstanding_amount ?? 0) > 0),
    [invoices]
  );

  const outstandingTotal = useMemo(() =>
    outstandingInvoices.reduce((sum, inv) => sum + (inv.outstanding_amount ?? 0), 0),
    [outstandingInvoices]
  );

  const activeWeddings = useMemo(() =>
    orders.filter((so) => so.delivery_date && so.delivery_date >= today),
    [orders, today]
  );

  const pipelineTotal = useMemo(() =>
    activeWeddings.reduce((sum, so) => sum + (so.grand_total ?? 0), 0),
    [activeWeddings]
  );

  const isCurrentYear = selectedYear === currentYear;
  const kpiLabel = isCurrentYear ? "YTD" : String(selectedYear);

  // Year selector control
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
                {formatVND(yearTotals.revenue)}
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
                {formatVND(yearTotals.expenses)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {yearTotals.net >= 0
                ? <TrendingUp className="h-4 w-4 text-green-600" />
                : <TrendingDown className="h-4 w-4 text-red-600" />}
              Net Profit {kpiLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-[120px]" />
            ) : (
              <div className={`text-2xl font-bold ${yearTotals.net >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                {formatVND(yearTotals.net)}
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
                {formatVND(yearTotals.collected)}
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
              <ComposedChart data={combinedMonthlyData}>
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
                  {formatVND(outstandingTotal)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {outstandingInvoices.length} invoice{outstandingInvoices.length !== 1 ? "s" : ""} with balance due
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
                  {formatVND(pipelineTotal)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {activeWeddings.length} upcoming wedding{activeWeddings.length !== 1 ? "s" : ""}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
