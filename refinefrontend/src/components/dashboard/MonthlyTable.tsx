import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMillions } from "@/lib/format";
import type { MonthRow } from "@/components/dashboard/financialOverview";

/** Exact monthly numbers behind the charts (text alternative to the chart). Newest month first. */
export function MonthlyTable({ data }: { data: MonthRow[] }) {
  const rows = [...data].reverse();
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Monthly table</CardTitle>
        <p className="text-xs text-muted-foreground">VND millions</p>
      </CardHeader>
      <Table className="min-w-[560px]">
        <TableHeader>
          <TableRow>
            <TableHead className="px-4">Month</TableHead>
            <TableHead className="px-4 text-right">Weddings</TableHead>
            <TableHead className="px-4 text-right">Revenue</TableHead>
            <TableHead className="px-4 text-right">Expenses</TableHead>
            <TableHead className="px-4 text-right">Net</TableHead>
            <TableHead className="px-4 text-right">Collected</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.month}>
              <TableCell className="px-4">{r.month}</TableCell>
              <TableCell className="px-4 text-right">{r.weddings}</TableCell>
              <TableCell className="px-4 text-right">{formatMillions(r.revenue)}</TableCell>
              <TableCell className="px-4 text-right">{formatMillions(r.expenses)}</TableCell>
              <TableCell className="px-4 text-right font-semibold">{formatMillions(r.net)}</TableCell>
              <TableCell className="px-4 text-right">{formatMillions(r.collected)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
