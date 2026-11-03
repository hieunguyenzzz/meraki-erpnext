import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatVNDFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MonthRow, OverviewTotals } from "@/components/dashboard/financialOverview";

const stickyCell = "sticky left-0 z-10 bg-card px-4";
const num = "whitespace-nowrap px-4 text-right";

/** Full monthly figures, newest first. Scrolls sideways on phones with the month column pinned. */
export function RevenueTable({ data, totals, year }: { data: MonthRow[]; totals: OverviewTotals; year: number }) {
  const rows = [...data].reverse();
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Month by month</CardTitle>
      </CardHeader>
      <Table className="min-w-[820px]">
        <TableHeader>
          <TableRow>
            <TableHead className={cn(stickyCell, "bg-muted")}>Month</TableHead>
            <TableHead className={num}>Weddings</TableHead>
            <TableHead className={num}>Revenue</TableHead>
            <TableHead className={num}>Expenses</TableHead>
            <TableHead className={num}>Net</TableHead>
            <TableHead className={num}>Collected</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.month}>
              <TableCell className={stickyCell}>{r.month}</TableCell>
              <TableCell className={num}>{r.weddings}</TableCell>
              <TableCell className={num}>{formatVNDFull(r.revenue)}</TableCell>
              <TableCell className={num}>{formatVNDFull(r.expenses)}</TableCell>
              <TableCell className={cn(num, "font-semibold", r.net < 0 && "text-destructive")}>{formatVNDFull(r.net)}</TableCell>
              <TableCell className={num}>{formatVNDFull(r.collected)}</TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-muted font-bold hover:bg-muted">
            <TableCell className={cn(stickyCell, "bg-muted font-bold")}>{year} total</TableCell>
            <TableCell className={num} />
            <TableCell className={num}>{formatVNDFull(totals.revenue)}</TableCell>
            <TableCell className={num}>{formatVNDFull(totals.expenses)}</TableCell>
            <TableCell className={cn(num, totals.net < 0 && "text-destructive")}>{formatVNDFull(totals.net)}</TableCell>
            <TableCell className={num}>{formatVNDFull(totals.collected)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Card>
  );
}
