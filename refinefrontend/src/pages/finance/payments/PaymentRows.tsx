import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatVNDFull } from "@/lib/format";
import { isoDate } from "../invoices/types";
import { type Payment, docstatusLabel, partyOf, typeVariant } from "./types";

const href = (p: Payment) => `/finance/payments/${encodeURIComponent(p.name)}`;

function Description({ p }: { p: Payment }) {
  if (!p.description) return <span className="text-muted-foreground">—</span>;
  return (
    <span>
      {p.description}
      {p.category && <span className="ml-1 text-muted-foreground">({p.category})</span>}
    </span>
  );
}

/** Drafts are listed alongside submitted entries; flag them so they are not read as paid. */
function DraftFlag({ p }: { p: Payment }) {
  return p.docstatus === 1 ? null : <Badge variant="secondary">{docstatusLabel(p.docstatus)}</Badge>;
}

/** Desktop layout (D-Payments.dc.html): sticky header, scrolls inside its own frame. */
export function PaymentTable({ rows }: { rows: Payment[] }) {
  return (
    <section className="overflow-hidden rounded-card border bg-card">
      <div className="max-h-[calc(100vh-22rem)] min-h-[16rem] overflow-auto">
        <table aria-label="Payment entries" className="w-full min-w-[820px] border-collapse text-sm tabular-nums">
          <thead className="sticky top-0 z-10 bg-muted text-[13px] text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-3 text-left font-semibold">Payment</th>
              <th scope="col" className="px-3 py-3 text-left font-semibold">Type</th>
              <th scope="col" className="px-3 py-3 text-left font-semibold">Party</th>
              <th scope="col" className="px-3 py-3 text-left font-semibold">Date</th>
              <th scope="col" className="px-3 py-3 text-left font-semibold">Description</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.name} className="border-t hover:bg-muted/60">
                <td className="whitespace-nowrap px-3 py-3">
                  <Link to={href(p)} className="font-medium text-primary hover:underline focus-visible:underline">{p.name}</Link>
                </td>
                <td className="whitespace-nowrap px-3 py-3">
                  <span className="inline-flex items-center gap-1.5">
                    <Badge variant={typeVariant(p.payment_type)}>{p.payment_type}</Badge>
                    <DraftFlag p={p} />
                  </span>
                </td>
                <td className="min-w-[10rem] px-3 py-3 font-medium">{partyOf(p)}</td>
                <td className="whitespace-nowrap px-3 py-3">{isoDate(p.posting_date)}</td>
                <td className="min-w-[10rem] px-3 py-3"><Description p={p} /></td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-semibold">{formatVNDFull(p.paid_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Phone layout: one card per payment. */
export function PaymentCard({ p }: { p: Payment }) {
  return (
    <Link to={href(p)} className="flex min-w-0 flex-col gap-2 rounded-card border bg-card p-4 active:bg-muted">
      <div className="flex items-center justify-between gap-2">
        <b className="truncate">{partyOf(p)}</b>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </div>
      {p.description && <p className="-mt-1 text-sm"><Description p={p} /></p>}
      <p className="text-sm text-muted-foreground tabular-nums">{p.name} · {isoDate(p.posting_date)}</p>
      <div className="flex items-end justify-between gap-2 tabular-nums">
        <div className="font-semibold">{formatVNDFull(p.paid_amount)}</div>
        <span className="flex items-center gap-1.5">
          <DraftFlag p={p} />
          <Badge variant={typeVariant(p.payment_type)}>{p.payment_type}</Badge>
        </span>
      </div>
    </Link>
  );
}
