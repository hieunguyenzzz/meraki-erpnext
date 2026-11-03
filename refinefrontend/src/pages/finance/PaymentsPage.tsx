import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { createParser, parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { RotateCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatePanel } from "@/components/StatePanel";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { formatVNDFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PaymentCard, PaymentTable } from "./payments/PaymentRows";
import { TYPE_FILTERS, type Payment, partyOf } from "./payments/types";

const PAGE = 50;
const ALL = "all";
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isoParam = createParser<string>({
  parse: (v) => (ISO.test(v) && !Number.isNaN(Date.parse(v)) ? v : null),
  serialize: (v) => v,
});
const opts = { clearOnDefault: true } as const;

export default function PaymentsPage() {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  // Filters live in the URL so Back restores them; junk values fall back to the defaults.
  const [type, setType] = useQueryState("type", parseAsStringLiteral(TYPE_FILTERS).withDefault(ALL).withOptions(opts));
  const [search, setSearch] = useQueryState("q", parseAsString.withDefault("").withOptions(opts));
  const [from, setFrom] = useQueryState("from", isoParam.withDefault("").withOptions(opts));
  const [to, setTo] = useQueryState("to", isoParam.withDefault("").withOptions(opts));

  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const load = useCallback(() => {
    setIsLoading(true);
    setError(false);
    fetch("/inquiry-api/payments")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setPayments(Array.isArray(data) ? data : []))
      .catch((e) => {
        console.error("Payments list failed to load", e);
        setError(true);
      })
      .finally(() => setIsLoading(false));
  }, []);
  useEffect(load, [load]);

  const deferredSearch = useDeferredValue(search);
  const rows = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return payments.filter((p) => {
      if (type !== ALL && p.payment_type !== type) return false;
      if (from && p.posting_date < from) return false;
      if (to && p.posting_date > to) return false;
      return !q || partyOf(p).toLowerCase().includes(q);
    });
  }, [payments, deferredSearch, type, from, to]);

  // Plain sums of the listed rows; money in and out are kept apart so they are never netted.
  const totals = useMemo(() => {
    const t = { Receive: 0, Pay: 0, Internal: 0 };
    for (const p of rows) {
      if (p.payment_type === "Receive") t.Receive += p.paid_amount || 0;
      else if (p.payment_type === "Pay") t.Pay += p.paid_amount || 0;
      else t.Internal += p.paid_amount || 0;
    }
    return t;
  }, [rows]);

  const visible = rows.slice(0, shown);
  const filtered = search.trim() !== "" || type !== ALL || from !== "" || to !== "";
  const reset = <T,>(setter: (v: T) => unknown) => (v: T) => { setShown(PAGE); void setter(v); };

  let body;
  if (error && payments.length === 0) {
    body = (
      <StatePanel
        kind="error"
        title="Couldn't load payments"
        text="The server didn't answer. Your data is safe."
        action={{ label: "Try again", onClick: load, icon: <RotateCw className="h-4 w-4" /> }}
      />
    );
  } else if (isLoading) {
    body = (
      <div className="flex flex-col gap-3" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-card md:h-12" />)}
      </div>
    );
  } else if (rows.length === 0) {
    body = (
      <StatePanel
        kind="empty"
        title={filtered ? "No payments match" : "No payments yet"}
        text={filtered ? "Try a different party, type or date range." : "Payments appear here once they are recorded."}
      />
    );
  } else {
    body = (
      <>
        {isDesktop ? (
          <PaymentTable rows={visible} />
        ) : (
          <div className="flex flex-col gap-3">{visible.map((p) => <PaymentCard key={p.name} p={p} />)}</div>
        )}
        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>Showing {visible.length} of {rows.length}</span>
          {rows.length > visible.length && (
            <Button variant="outline" className="max-md:h-12" onClick={() => setShown((n) => n + PAGE)}>Show more</Button>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <h1 className="text-2xl font-semibold leading-tight md:font-display md:text-4xl md:leading-10">Payments</h1>

      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
        <div className="relative md:w-80">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label="Search by party"
            placeholder="Search by party"
            value={search}
            onChange={(e) => reset(setSearch)(e.target.value)}
            className="rounded-full pl-10 max-md:h-12 max-md:pl-10"
          />
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <Input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => reset(setFrom)(e.target.value)} className="rounded-full min-w-0 max-md:h-12 max-md:flex-1 md:w-40" />
          <span className="text-sm text-muted-foreground" aria-hidden>to</span>
          <Input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => reset(setTo)(e.target.value)} className="rounded-full min-w-0 max-md:h-12 max-md:flex-1 md:w-40" />
        </div>
      </div>

      <div role="group" aria-label="Filter by type" className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {TYPE_FILTERS.map((t) => {
          const on = type === t;
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() => reset(setType)(t)}
              className={cn(
                "inline-flex h-10 shrink-0 items-center rounded-full border px-4 text-sm font-medium max-md:h-12",
                on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
              )}
            >
              {t === ALL ? "All" : t}
            </button>
          );
        })}
      </div>

      {!isLoading && rows.length > 0 && (
        <section aria-label="Total of shown payments" className="flex flex-wrap items-baseline gap-x-8 gap-y-2 rounded-card border bg-card p-4 tabular-nums">
          <div className="w-full text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total of shown payments</div>
          {totals.Receive > 0 && <div><span className="text-sm text-muted-foreground">Received </span><b className="text-lg font-semibold">{formatVNDFull(totals.Receive)}</b></div>}
          {totals.Pay > 0 && <div><span className="text-sm text-muted-foreground">Paid </span><b className="text-lg font-semibold">{formatVNDFull(totals.Pay)}</b></div>}
          {totals.Internal > 0 && <div><span className="text-sm text-muted-foreground">Internal transfers </span><b className="text-lg font-semibold">{formatVNDFull(totals.Internal)}</b></div>}
        </section>
      )}

      {body}
    </div>
  );
}
