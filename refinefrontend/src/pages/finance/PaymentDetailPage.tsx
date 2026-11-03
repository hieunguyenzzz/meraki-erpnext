import { useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useOne } from "@refinedev/core";
import { ChevronRight, RotateCw } from "lucide-react";
import { formatVNDFull } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { StatePanel } from "@/components/StatePanel";
import FileAttachments from "@/components/FileAttachments";
import { DetailSkeleton } from "@/components/detail-skeleton";
import { isoDate } from "./invoices/types";
import { docstatusLabel, docstatusVariant, formatPaid, typeVariant } from "./payments/types";

interface Reference { reference_doctype: string; reference_name: string; allocated_amount: number }

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm tabular-nums">{children}</dd>
    </div>
  );
}

/** Sales Invoices and Purchase Invoices have pages; anything else is shown as plain text. */
function refHref(r: Reference) {
  const n = encodeURIComponent(r.reference_name);
  if (r.reference_doctype === "Sales Invoice") return `/finance/invoices/${n}`;
  if (r.reference_doctype === "Purchase Invoice") return `/finance/expenses/${n}`;
  return null;
}

function RefRow({ r }: { r: Reference }) {
  const to = refHref(r);
  const inner = (
    <>
      <span className="min-w-0">
        <b className="block break-all font-medium">{r.reference_name}</b>
        <span className="text-muted-foreground">{r.reference_doctype}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2 font-semibold">
        {formatVNDFull(r.allocated_amount)}
        {to && <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />}
      </span>
    </>
  );
  const cls = "flex min-h-12 items-center justify-between gap-3 rounded-md bg-muted px-3 py-2.5 text-sm tabular-nums";
  return to ? <Link to={to} className={`${cls} hover:bg-accent active:bg-accent`}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

export default function PaymentDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();

  const { result: payment, query } = useOne({
    resource: "Payment Entry",
    id: name!,
    // A missing or forbidden record will not appear on retry; show the state straight away.
    queryOptions: {
      retry: (count, err) => {
        const code = (err as { statusCode?: number } | null)?.statusCode;
        return code !== 403 && code !== 404 && count < 1;
      },
    },
  });
  const status = (query.error as { statusCode?: number } | null)?.statusCode;
  const notFound = status === 404 || status === 403;

  useEffect(() => {
    if (query.isError) console.error("Payment failed to load", name, query.error);
  }, [query.isError, query.error, name]);

  if (query.isError) {
    return notFound ? (
      <StatePanel
        kind="empty"
        title="Payment not found"
        text="It may have been deleted, or you may not have access to it."
        action={{ label: "Back to payments", onClick: () => navigate("/finance/payments") }}
      />
    ) : (
      <StatePanel
        kind="error"
        title="Couldn't load this payment"
        text="The server didn't answer. Your data is safe."
        action={{ label: "Try again", onClick: () => void query.refetch(), icon: <RotateCw className="h-4 w-4" /> }}
      />
    );
  }
  if (!payment) return <DetailSkeleton />;

  const refs = (payment.references ?? []) as Reference[];

  return (
    <div className="flex flex-col gap-4 pb-6">
      <header className="flex flex-col gap-4 rounded-card border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold leading-tight md:font-display md:text-4xl md:leading-10">{payment.name}</h1>
          <Badge variant={typeVariant(payment.payment_type)}>{payment.payment_type}</Badge>
          <Badge variant={docstatusVariant(payment.docstatus)}>{docstatusLabel(payment.docstatus)}</Badge>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount</div>
          <div className="text-3xl font-semibold tabular-nums">{formatPaid(payment.paid_amount, payment.paid_from_account_currency)}</div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t pt-4 md:grid-cols-4">
          <Fact label="Party">{payment.party_name || payment.party || "—"}</Fact>
          <Fact label="Date">{isoDate(payment.posting_date)}</Fact>
          <Fact label="Mode">{payment.mode_of_payment || "-"}</Fact>
          {payment.reference_no && <Fact label="Reference #">{payment.reference_no}</Fact>}
        </dl>
      </header>

      {refs.length > 0 && (
        <section aria-label="Linked invoices" className="rounded-card border bg-card p-5">
          <h2 className="mb-3 text-lg font-semibold">Linked invoices</h2>
          <ul className="flex flex-col gap-2">
            {refs.map((r, i) => <li key={`${r.reference_name}-${i}`}><RefRow r={r} /></li>)}
          </ul>
        </section>
      )}

      <FileAttachments doctype="Payment Entry" docname={name!} />
    </div>
  );
}
