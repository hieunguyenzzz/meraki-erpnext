import { useState, useEffect, useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { formatVND } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";

interface MonthlyRow {
  month: string;
  revenue: number;
  expenses: number;
  net: number;
}

const breakdownColumns: ColumnDef<MonthlyRow, unknown>[] = [
  {
    accessorKey: "month",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Month" />,
    cell: ({ row }) => <span className="font-medium">{row.original.month}</span>,
  },
  {
    accessorKey: "revenue",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Revenue" className="text-right" />,
    cell: ({ row }) => <div className="text-right text-green-700 dark:text-green-400">{formatVND(row.original.revenue)}</div>,
  },
  {
    accessorKey: "expenses",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Expenses" className="text-right" />,
    cell: ({ row }) => <div className="text-right text-red-700 dark:text-red-400">{formatVND(row.original.expenses)}</div>,
  },
  {
    accessorKey: "net",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Net" className="text-right" />,
    cell: ({ row }) => (
      <div className={`text-right font-medium ${row.original.net >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
        {formatVND(row.original.net)}
      </div>
    ),
  },
];

export default function OverviewPage() {
  const [allMonths, setAllMonths] = useState<MonthlyRow[]>([]);
  const [totals, setTotals] = useState({ revenue: 0, expenses: 0, net: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch all-time overview (use a large year range by fetching current year;
    // the endpoint returns all data for the year, but for all-time we aggregate across years)
    // For OverviewPage we want all historical data — fetch all available years.
    const currentYear = new Date().getFullYear();
    setIsLoading(true);
    fetch(`/inquiry-api/financial-overview?year=${currentYear}`)
      .then((r) => r.json())
      .then(async (d) => {
        const availableYears: number[] = d.available_years ?? [currentYear];
        // Fetch all years and aggregate
        const allData = await Promise.all(
          availableYears.map((y: number) =>
            fetch(`/inquiry-api/financial-overview?year=${y}`).then((r) => r.json())
          )
        );
        const monthMap = new Map<string, { revenue: number; expenses: number }>();
        for (const yearData of allData) {
          for (const row of yearData.months ?? []) {
            if (!row.revenue && !row.expenses) continue;
            const entry = monthMap.get(row.month) ?? { revenue: 0, expenses: 0 };
            entry.revenue += row.revenue;
            entry.expenses += row.expenses;
            monthMap.set(row.month, entry);
          }
        }
        const rows: MonthlyRow[] = Array.from(monthMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, data]) => ({ month, ...data, net: data.revenue - data.expenses }));

        setAllMonths(rows);
        const t = rows.reduce(
          (acc, r) => ({ revenue: acc.revenue + r.revenue, expenses: acc.expenses + r.expenses, net: acc.net + r.net }),
          { revenue: 0, expenses: 0, net: 0 }
        );
        setTotals(t);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const monthlyDataDesc = useMemo(
    () => [...allMonths].sort((a, b) => b.month.localeCompare(a.month)),
    [allMonths]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Revenue Overview</h1>
        <p className="text-muted-foreground">Monthly revenue, expenses, and profit</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-[120px]" />
            ) : (
              <div className="text-2xl font-bold text-green-700 dark:text-green-400">{formatVND(totals.revenue)}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-[120px]" />
            ) : (
              <div className="text-2xl font-bold text-red-700 dark:text-red-400">{formatVND(totals.expenses)}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue vs Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : allMonths.length === 0 ? (
            <p className="text-muted-foreground">No data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={allMonths}>
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(0)}M`} />
                <Tooltip formatter={(v: number) => formatVND(v)} />
                <Legend />
                <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--chart-revenue))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill="hsl(var(--chart-expenses))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <DataTable
        columns={breakdownColumns}
        data={monthlyDataDesc}
        isLoading={isLoading}
        searchKey="month"
        searchPlaceholder="Search by month..."
      />
    </div>
  );
}
