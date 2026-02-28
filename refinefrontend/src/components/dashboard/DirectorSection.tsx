import { useMemo } from "react";
import { useList } from "@refinedev/core";
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, DollarSign, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const isLoading =
    invoicesQuery?.isLoading ||
    journalsQuery?.isLoading ||
    paymentsQuery?.isLoading ||
    ordersQuery?.isLoading;

  const invoices = (invoicesResult?.data ?? []) as any[];
  const journals = (journalsResult?.data ?? []) as any[];
  const payments = (paymentsResult?.data ?? []) as any[];
  const orders = (ordersResult?.data ?? []) as any[];

  const currentYear = new Date().getFullYear().toString();
  const today = new Date().toISOString().split("T")[0];

  const last12Months = useMemo(() => {
    const months: string[] = [];
    const d = new Date();
    for (let i = 11; i >= 0; i--) {
      const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
      months.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
    }
    return months;
  }, []);

  const monthlyData = useMemo(() => {
    const map = new Map<string, { revenue: number; expenses: number; collected: number }>();

    for (const month of last12Months) {
      map.set(month, { revenue: 0, expenses: 0, collected: 0 });
    }

    for (const inv of invoices) {
      const month = inv.posting_date?.substring(0, 7);
      if (!month || !map.has(month)) continue;
      const entry = map.get(month)!;
      entry.revenue += inv.grand_total ?? 0;
    }

    for (const j of journals) {
      const month = j.posting_date?.substring(0, 7);
      if (!month || !map.has(month)) continue;
      const entry = map.get(month)!;
      entry.expenses += j.total_debit ?? 0;
    }

    for (const p of payments) {
      const month = p.posting_date?.substring(0, 7);
      if (!month || !map.has(month)) continue;
      const entry = map.get(month)!;
      entry.collected += p.paid_amount ?? 0;
    }

    return last12Months.map((month) => {
      const data = map.get(month)!;
      return { month, ...data, net: data.revenue - data.expenses };
    });
  }, [invoices, journals, payments, last12Months]);

  const ytd = useMemo(() => {
    let revenue = 0, expenses = 0, collected = 0;

    for (const inv of invoices) {
      if (inv.posting_date?.startsWith(currentYear)) revenue += inv.grand_total ?? 0;
    }
    for (const j of journals) {
      if (j.posting_date?.startsWith(currentYear)) expenses += j.total_debit ?? 0;
    }
    for (const p of payments) {
      if (p.posting_date?.startsWith(currentYear)) collected += p.paid_amount ?? 0;
    }

    return { revenue, expenses, net: revenue - expenses, collected };
  }, [invoices, journals, payments, currentYear]);

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

  return (
    <div className="space-y-6">
      {/* Row 1: KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Revenue YTD
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-[120px]" />
            ) : (
              <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                {formatVND(ytd.revenue)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              Expenses YTD
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-[120px]" />
            ) : (
              <div className="text-2xl font-bold text-red-700 dark:text-red-400">
                {formatVND(ytd.expenses)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {ytd.net >= 0
                ? <TrendingUp className="h-4 w-4 text-green-600" />
                : <TrendingDown className="h-4 w-4 text-red-600" />}
              Net Profit YTD
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-[120px]" />
            ) : (
              <div className={`text-2xl font-bold ${ytd.net >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                {formatVND(ytd.net)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Cash Collected YTD
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-[120px]" />
            ) : (
              <div className="text-2xl font-bold">
                {formatVND(ytd.collected)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Charts */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Revenue vs Expenses (Last 12 Months)</CardTitle>
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
            <CardTitle className="text-sm font-medium">Net Profit Trend (Last 12 Months)</CardTitle>
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

      {/* Row 3: Stat Cards */}
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
