import { Badge } from "@/components/ui/badge";
import { formatVNDFull } from "@/lib/format";
import { STATUS_VARIANT, type ExpenseRow, type ExpenseSummary } from "./types";

const iso = (d: string) => d.slice(0, 10);

function Receipt({ url }: { url: string | null }) {
  const size = "h-12 w-12";
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

/** Desktop layout (D-ExpenseReport.dc.html). */
export function ExpenseTable({ rows, summary }: { rows: ExpenseRow[]; summary: ExpenseSummary }) {
  const notCounted = summary.count - summary.counted;
  return (
    <section className="overflow-hidden rounded-card border bg-card">
      <div className="overflow-x-auto">
        <table aria-label="Wedding expenses" className="w-full min-w-[900px] border-collapse text-sm tabular-nums">
          <thead className="bg-muted text-[13px] text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-semibold">Date</th>
              <th scope="col" className="px-4 py-3 text-left font-semibold">Wedding</th>
              <th scope="col" className="px-4 py-3 text-left font-semibold">Category</th>
              <th scope="col" className="px-4 py-3 text-left font-semibold">Description</th>
              <th scope="col" className="px-4 py-3 text-left font-semibold">Staff</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Amount</th>
              <th scope="col" className="px-4 py-3 text-left font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t">
                <td className="whitespace-nowrap px-4 py-3">{iso(r.posting_date)}</td>
                <td className="whitespace-nowrap px-4 py-3">{r.project_name}</td>
                <td className="whitespace-nowrap px-4 py-3">{r.category_label || "Uncategorised"}</td>
                <td className="min-w-[200px] px-4 py-3">{r.description}</td>
                <td className="whitespace-nowrap px-4 py-3">{r.staff_name}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-bold">{formatVNDFull(r.amount)}</td>
                <td className="px-4 py-3"><StatusBadge s={r.status} /></td>
              </tr>
            ))}
            <tr className="border-t bg-muted/60 font-bold">
              <td colSpan={5} className="px-4 py-3">
                Total · {summary.counted} approved {summary.counted === 1 ? "expense" : "expenses"}
                {notCounted > 0 && <span className="font-normal text-muted-foreground"> ({notCounted} pending or rejected not counted)</span>}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right">{formatVNDFull(summary.total)}</td>
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
      <Receipt url={row.receipt_url} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <b className="min-w-0 break-words text-sm">{row.description || row.category_label}</b>
          <b className="shrink-0 text-sm">{formatVNDFull(row.amount)}</b>
        </div>
        <p className="text-xs text-muted-foreground">{[row.project_name, row.category_label, row.staff_name].filter(Boolean).join(" · ")}</p>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{iso(row.posting_date)}</span>
          <StatusBadge s={row.status} />
        </div>
      </div>
    </article>
  );
}
