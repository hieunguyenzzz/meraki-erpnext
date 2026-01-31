import { useMemo } from "react";
import { useList } from "@refinedev/core";
import { Users, Heart, UserCheck, FileText } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatVND } from "@/lib/format";

export default function DashboardPage() {
  const { result: customersResult } = useList({
    resource: "Customer",
    pagination: { mode: "off" },
    meta: { fields: ["name"] },
  });

  const { result: ordersResult } = useList({
    resource: "Sales Order",
    pagination: { mode: "off" },
    meta: { fields: ["name", "transaction_date"] },
  });

  const { result: employeesResult } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "eq", value: "Active" }],
    meta: { fields: ["name"] },
  });

  const { result: invoicesResult } = useList({
    resource: "Sales Invoice",
    pagination: { mode: "off" },
    filters: [{ field: "docstatus", operator: "eq", value: 1 }],
    meta: { fields: ["grand_total", "posting_date"] },
  });

  const customers = customersResult?.data ?? [];
  const orders = ordersResult?.data ?? [];
  const invoices = invoicesResult?.data ?? [];
  const employees = employeesResult?.data ?? [];

  const totalRevenue = useMemo(() => {
    return invoices.reduce((sum: number, inv: any) => sum + (inv.grand_total ?? 0), 0);
  }, [invoices]);

  const monthlyRevenue = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of invoices as any[]) {
      const month = inv.posting_date?.substring(0, 7);
      if (!month) continue;
      map.set(month, (map.get(month) ?? 0) + (inv.grand_total ?? 0));
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, revenue]) => ({ month, revenue }));
  }, [invoices]);

  const weddingsByMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders as any[]) {
      const month = o.transaction_date?.substring(0, 7);
      if (!month) continue;
      map.set(month, (map.get(month) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));
  }, [orders]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Customers"
          value={customersResult ? customers.length : "..."}
          icon={Users}
          description="Total customers"
        />
        <MetricCard
          title="Weddings"
          value={ordersResult ? orders.length : "..."}
          icon={Heart}
          description="Total sales orders"
        />
        <MetricCard
          title="Employees"
          value={employeesResult ? employees.length : "..."}
          icon={UserCheck}
          description="Active employees"
        />
        <MetricCard
          title="Revenue"
          value={invoicesResult ? formatVND(totalRevenue) : "..."}
          icon={FileText}
          description="Total invoiced"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyRevenue.length === 0 ? (
              <p className="text-muted-foreground">No data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthlyRevenue}>
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(0)}M`} />
                  <Tooltip formatter={(v: number) => formatVND(v)} />
                  <Bar dataKey="revenue" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weddings by Month</CardTitle>
          </CardHeader>
          <CardContent>
            {weddingsByMonth.length === 0 ? (
              <p className="text-muted-foreground">No data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={weddingsByMonth}>
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(346, 77%, 50%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
