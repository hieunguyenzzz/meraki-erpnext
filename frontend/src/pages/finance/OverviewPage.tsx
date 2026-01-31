import { useMemo } from "react";
import { useFrappeGetDocList } from "frappe-react-sdk";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { formatVND } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function OverviewPage() {
  const { data: invoices } = useFrappeGetDocList("Sales Invoice", {
    filters: [["docstatus", "=", 1]],
    fields: ["posting_date", "grand_total"],
    limit_start: 0,
    limit: 0,
  });

  const { data: journals } = useFrappeGetDocList("Journal Entry", {
    filters: [["docstatus", "=", 1]],
    fields: ["posting_date", "total_debit", "voucher_type"],
    limit_start: 0,
    limit: 0,
  });

  const monthlyData = useMemo(() => {
    const map = new Map<string, { revenue: number; expenses: number }>();

    for (const inv of invoices ?? []) {
      const month = inv.posting_date?.substring(0, 7);
      if (!month) continue;
      const entry = map.get(month) ?? { revenue: 0, expenses: 0 };
      entry.revenue += inv.grand_total;
      map.set(month, entry);
    }

    for (const j of journals ?? []) {
      const month = j.posting_date?.substring(0, 7);
      if (!month) continue;
      const entry = map.get(month) ?? { revenue: 0, expenses: 0 };
      entry.expenses += j.total_debit;
      map.set(month, entry);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, ...data, net: data.revenue - data.expenses }));
  }, [invoices, journals]);

  const monthlyDataDesc = useMemo(() => {
    return [...monthlyData].sort((a, b) => b.month.localeCompare(a.month));
  }, [monthlyData]);

  const totals = useMemo(() => {
    return monthlyData.reduce(
      (acc, row) => ({
        revenue: acc.revenue + row.revenue,
        expenses: acc.expenses + row.expenses,
        net: acc.net + row.net,
      }),
      { revenue: 0, expenses: 0, net: 0 }
    );
  }, [monthlyData]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Revenue Overview</h1>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{formatVND(totals.revenue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">{formatVND(totals.expenses)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totals.net >= 0 ? "text-green-700" : "text-red-700"}`}>
              {formatVND(totals.net)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue vs Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyData.length === 0 ? (
            <p className="text-muted-foreground">No data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData}>
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(0)}M`} />
                <Tooltip formatter={(v: number) => formatVND(v)} />
                <Legend />
                <Bar dataKey="revenue" name="Revenue" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyDataDesc.length === 0 ? (
            <p className="text-muted-foreground">No data available</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyDataDesc.map((row) => (
                  <TableRow key={row.month}>
                    <TableCell className="font-medium">{row.month}</TableCell>
                    <TableCell className="text-right text-green-700">{formatVND(row.revenue)}</TableCell>
                    <TableCell className="text-right text-red-700">{formatVND(row.expenses)}</TableCell>
                    <TableCell className={`text-right font-medium ${row.net >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {formatVND(row.net)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
