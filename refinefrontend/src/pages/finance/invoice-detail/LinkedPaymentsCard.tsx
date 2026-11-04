import { useEffect } from "react";
import { Link } from "react-router";
import { useList } from "@refinedev/core";
import { Skeleton } from "@/components/ui/skeleton";
import { formatVNDPlain, formatVNDFull } from "@/lib/format";
import { DetailCard } from "../DetailCard";
import { isoDate } from "../invoices/types";

interface PaymentRow {
  name: string;
  posting_date: string;
  mode_of_payment?: string | null;
  allocated_amount: number;
}

/** Submitted Payment Entries that allocate to this invoice, plus what is still to collect. */
export function LinkedPaymentsCard({ invoiceName, outstanding, collectable }: { invoiceName: string; outstanding: number; collectable: boolean }) {
  const { result, query } = useList({
    resource: "Payment Entry",
    pagination: { mode: "off" },
    sorters: [{ field: "posting_date", order: "asc" }],
    meta: {
      fields: ["name", "posting_date", "mode_of_payment", "`tabPayment Entry Reference`.allocated_amount"],
      rawFilters: [["Payment Entry Reference", "reference_name", "=", invoiceName], ["docstatus", "=", 1]],
    },
  });
  useEffect(() => {
    if (query.isError) console.error("Linked payments failed to load", invoiceName, query.error);
  }, [query.isError, query.error, invoiceName]);
  const payments = (result?.data ?? []) as PaymentRow[];

  return (
    <DetailCard title="Linked payments">
      {query.isLoading ? (
        <Skeleton className="h-16 w-full rounded-xl" />
      ) : query.isError ? (
        <p role="alert" className="text-sm text-danger-soft-foreground">Couldn't load the linked payments.</p>
      ) : payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No payment recorded against this invoice yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {payments.map((p) => (
            <li key={p.name}>
              <Link to={`/finance/payments/${encodeURIComponent(p.name)}`}
                className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-muted px-3.5 py-3 text-sm text-foreground hover:bg-accent">
                <span className="min-w-0">
                  <b className="block break-all">{p.name}</b>
                  <span className="text-muted-foreground">{[isoDate(p.posting_date), p.mode_of_payment].filter(Boolean).join(" · ")}</span>
                </span>
                <b className="shrink-0 tabular-nums">{formatVNDPlain(p.allocated_amount)}</b>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {collectable && outstanding > 0 && (
        <p className="text-sm text-muted-foreground">{formatVNDFull(outstanding)} still to collect.</p>
      )}
    </DetailCard>
  );
}
