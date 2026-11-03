import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { formatVNDFull } from "@/lib/format";
import { STATUS_VARIANT, type ExpenseGroup, type ExpenseRow, type ExpenseSummary } from "./types";

const iso = (d: string) => d.slice(0, 10);

function Receipt({ url, size }: { url: string | null; size: string }) {
  if (!url) return <div className={`${size} flex shrink-0 items-center justify-center rounded bg-muted text-xs text-muted-foreground`} aria-label="No receipt">--</div>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open receipt" className="shrink-0">
      <img src={url} alt="" className={`${size} rounded object-cover hover:opacity-80`} />
    </a>
  );
}

function StatusBadge({ s }: { s: string }) {
  return <Badge variant={STATUS_VARIANT[s] ?? "secondary"}>{s}</Badge>;
}

function DesktopRow({ row }: { row: ExpenseRow }) {
  return (
    <tr className="border-t hover:bg-muted/40">
      <td className="w-[56px] p-1.5"><Receipt url={row.receipt_url} size="h-10 w-10" /></td>
      <td className="whitespace-nowrap px-3 py-2.5">{iso(row.posting_date)}</td>
      <td className="min-w-[200px] px-3 py-2.5">{row.description}</td>
      <td className="px-3 py-2.5">{row.category_label}</td>
      <td className="px-3 py-2.5">{row.staff_name}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">{formatVNDFull(row.amount)}</td>
      <td className="px-3 py-2.5 text-center"><StatusBadge s={row.status} /></td>
    </tr>
  );
}

/** Desktop layout, in the table style of D-Reports.dc.html. `groups` is null for the flat list. */
export function ExpenseTable({ rows, groups, summary }: { rows: ExpenseRow[]; groups: ExpenseGroup[] | null; summary: ExpenseSummary | null }) {
  return (
    <section className="overflow-hidden rounded-card border bg-card">
      <div className="max-h-[calc(100vh-26rem)] min-h-[16rem] overflow-auto">
        <table aria-label="Wedding expenses" className="w-full min-w-[820px] border-collapse text-sm tabular-nums">
          <thead className="sticky top-0 z-10 bg-muted text-[13px] text-muted-foreground">
            <tr>
              <th scope="col" className="w-[56px] px-3 py-3"><span className="sr-only">Receipt</span></th>
              <th scope="col" className="px-3 py-3 text-left font-semibold">Date</th>
              <th scope="col" className="px-3 py-3 text-left font-semibold">Description</th>
              <th scope="col" className="px-3 py-3 text-left font-semibold">Category</th>
              <th scope="col" className="px-3 py-3 text-left font-semibold">Staff</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Amount</th>
              <th scope="col" className="px-3 py-3 text-center font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {groups
              ? groups.map((g) => (
                  <Fragment key={g.label}>
                    <tr className="border-t bg-muted/50">
                      <td colSpan={5} className="px-3 py-2.5 font-semibold">{g.label}</td>
                      <td className="px-3 py-2.5 text-right font-semibold">{formatVNDFull(g.subtotal)}</td>
                      <td />
                    </tr>
                    {g.rows.map((r) => <DesktopRow key={r.name} row={r} />)}
                  </Fragment>
                ))
              : rows.map((r) => <DesktopRow key={r.name} row={r} />)}
            <tr className="border-t bg-muted font-bold">
              <td colSpan={5} className="px-3 py-3">Total</td>
              <td className="whitespace-nowrap px-3 py-3 text-right">{formatVNDFull(summary?.total)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Phone layout: one card per expense. */
export function ExpenseCard({ row }: { row: ExpenseRow }) {
  return (
    <article className="flex min-w-0 gap-3 rounded-card border bg-card p-3 tabular-nums">
      <Receipt url={row.receipt_url} size="h-12 w-12" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <b className="min-w-0 break-words text-sm">{row.description || row.category_label}</b>
          <b className="shrink-0 text-sm">{formatVNDFull(row.amount)}</b>
        </div>
        <p className="text-xs text-muted-foreground">{[row.category_label, row.staff_name].filter(Boolean).join(" · ")}</p>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{iso(row.posting_date)}</span>
          <StatusBadge s={row.status} />
        </div>
      </div>
    </article>
  );
}

export function GroupHeader({ g }: { g: ExpenseGroup }) {
  return (
    <div className="flex items-center justify-between gap-2 px-1 pt-2 text-sm font-semibold tabular-nums">
      <span className="min-w-0 truncate">{g.label}</span>
      <span className="shrink-0">{formatVNDFull(g.subtotal)}</span>
    </div>
  );
}
