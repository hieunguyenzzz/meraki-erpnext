import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { axisTick, chartColors, monthNumber, monthShort, tooltipStyles } from "@/lib/chartTheme";
import { formatMillions, formatVNDFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MonthRow } from "@/components/dashboard/financialOverview";

type SeriesKey = "revenue" | "expenses" | "weddings" | "net";

const SERIES: { key: SeriesKey; label: string; color: string; money: boolean }[] = [
  { key: "revenue", label: "Revenue", color: chartColors.revenue, money: true },
  { key: "expenses", label: "Expenses", color: chartColors.expenses, money: true },
  { key: "weddings", label: "Weddings", color: chartColors.weddings, money: false },
  { key: "net", label: "Net profit", color: chartColors.net, money: true },
];

const grid = <CartesianGrid vertical={false} stroke={chartColors.grid} />;

/** Phone: one series at a time, 01-12 month labels, one axis. */
function MobileChart({ data }: { data: MonthRow[] }) {
  const [key, setKey] = useState<SeriesKey>("revenue");
  const s = SERIES.find((x) => x.key === key)!;
  return (
    <>
      <div role="tablist" aria-label="Chart series" className="mb-3 grid grid-cols-4 gap-1 rounded-full bg-muted p-1">
        {SERIES.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={x.key === key}
            onClick={() => setKey(x.key)}
            className={cn(
              "min-h-9 rounded-full px-1 text-xs font-medium transition-colors",
              x.key === key ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            {x.label === "Net profit" ? "Net" : x.label}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          {grid}
          <XAxis dataKey="month" tick={axisTick} tickFormatter={monthNumber} interval={0} tickLine={false} axisLine={{ stroke: chartColors.grid }} />
          <YAxis
            width={s.money ? 52 : 28}
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tickFormatter={(v: number) => (s.money ? formatMillions(v) : String(v))}
          />
          <Tooltip
            {...tooltipStyles}
            cursor={{ fill: chartColors.cursor }}
            formatter={(v: number) => [s.money ? formatVNDFull(v) : v, s.label]}
          />
          <Bar dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs text-muted-foreground">
        {s.money ? "Values in VND millions." : "Weddings per month."} Months 01 to 12; tap a bar for the exact figure.
      </p>
    </>
  );
}

/** Desktop: Revenue and Expenses side by side on one money axis (weddings live in the table below). */
function DesktopChart({ data }: { data: MonthRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
        {grid}
        <XAxis dataKey="month" tick={axisTick} tickFormatter={monthShort} interval={0} tickLine={false} axisLine={{ stroke: chartColors.grid }} />
        <YAxis width={64} tick={axisTick} tickLine={false} axisLine={false} tickFormatter={formatMillions} />
        <Tooltip {...tooltipStyles} cursor={{ fill: chartColors.cursor }} formatter={(v: number, name: string) => [formatVNDFull(v), name]} />
        <Bar dataKey="revenue" name="Revenue" fill={chartColors.revenue} radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar dataKey="expenses" name="Expenses" fill={chartColors.expenses} radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MonthlyChart({ data }: { data: MonthRow[] }) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-base font-semibold">{isDesktop ? "Monthly revenue and expenses" : "By month"}</CardTitle>
        {isDesktop && (
          <div className="flex gap-4 text-[13px] text-foreground">
            {SERIES.slice(0, 2).map((x) => (
              <span key={x.key} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: x.color }} />
                {x.label}
              </span>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {isDesktop ? <DesktopChart data={data} /> : <MobileChart data={data} />}
      </CardContent>
    </Card>
  );
}
