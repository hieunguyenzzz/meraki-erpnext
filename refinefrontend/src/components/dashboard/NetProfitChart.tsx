import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { axisTick, chartColors, monthShort, tooltipStyles } from "@/lib/chartTheme";
import { formatMillions, formatVNDFull } from "@/lib/format";
import type { MonthRow } from "@/components/dashboard/financialOverview";

/** Desktop only; on phones net profit is the "Net" segment of the By month chart. */
export function NetProfitChart({ data, year }: { data: MonthRow[]; year: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Net profit trend ({year})</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={chartColors.grid} />
            <XAxis dataKey="month" tick={axisTick} tickFormatter={monthShort} interval={0} tickLine={false} axisLine={{ stroke: chartColors.grid }} />
            <YAxis width={64} tick={axisTick} tickLine={false} axisLine={false} tickFormatter={formatMillions} />
            <Tooltip {...tooltipStyles} formatter={(v: number) => [formatVNDFull(v), "Net profit"]} />
            <ReferenceLine y={0} strokeDasharray="3 3" stroke={chartColors.axisText} />
            <Area dataKey="net" name="Net profit" stroke={chartColors.net} strokeWidth={2} fill={chartColors.net} fillOpacity={0.15} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
