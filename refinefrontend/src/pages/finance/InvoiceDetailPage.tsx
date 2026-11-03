import { useParams, Link } from "react-router";
import { useOne } from "@refinedev/core";
import { RotateCw } from "lucide-react";
import { formatVNDFull } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { StatePanel } from "@/components/StatePanel";
import { DetailSkeleton } from "@/components/detail-skeleton";
import { isoDate, statusVariant } from "./invoices/types";

interface InvoiceItem { item_name: string; qty: number; amount: number; sales_order?: string }
interface InvoiceTax { description: string; tax_amount: number }

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm tabular-nums">{children}</dd>
    </div>
  );
}

export default function InvoiceDetailPage() {
  const { name } = useParams<{ name: string }>();

  const { result: invoice, query } = useOne({ resource: "Sales Invoice", id: name! });
  const projectId: string | undefined = invoice?.project || undefined;
  const { result: project } = useOne({
    resource: "Project",
    id: projectId ?? "",
    queryOptions: { enabled: !!projectId },
    meta: { fields: ["name", "project_name"] },
  });

  if (query.isError) {
    console.error("Invoice failed to load", name, query.error);
    return (
      <StatePanel
        kind="error"
        title="Couldn't load this invoice"
        text="It may not exist, or the server didn't answer."
        action={{ label: "Try again", onClick: () => void query.refetch(), icon: <RotateCw className="h-4 w-4" /> }}
      />
    );
  }
  if (!invoice) return <DetailSkeleton />;

  const items = (invoice.items ?? []) as InvoiceItem[];
  const taxes = ((invoice.taxes ?? []) as InvoiceTax[]).filter((t) => t.tax_amount);
  const linkedSalesOrder = items.find((item) => item.sales_order)?.sales_order;

  return (
    <div className="flex flex-col gap-4 pb-6">
      <header className="flex flex-col gap-4 rounded-card border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold leading-tight md:font-display md:text-4xl md:leading-10">{invoice.name}</h1>
          <Badge variant={statusVariant(invoice.status)}>{invoice.status}</Badge>
          {invoice.custom_invoice_category && <Badge variant="outline">{invoice.custom_invoice_category}</Badge>}
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
          <Fact label="Customer">{invoice.customer_name}</Fact>
          <Fact label="Wedding">
            {projectId ? (
              <Link to={`/projects/${encodeURIComponent(projectId)}`} className="inline-flex min-h-10 items-center font-medium text-primary hover:underline md:min-h-0">
                {project?.project_name || projectId}
              </Link>
            ) : "—"}
          </Fact>
          <Fact label="Issued">{isoDate(invoice.posting_date)}</Fact>
          <Fact label="Due">{isoDate(invoice.due_date)}</Fact>
          {linkedSalesOrder && <Fact label="Sales order">{linkedSalesOrder}</Fact>}
        </dl>
        <div className="grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</div>
            <div className="text-2xl font-semibold tabular-nums">{formatVNDFull(invoice.grand_total)}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outstanding</div>
            <div className="text-2xl font-semibold tabular-nums">{formatVNDFull(invoice.outstanding_amount)}</div>
          </div>
        </div>
      </header>

      {(items.length > 0 || taxes.length > 0) && (
        <section aria-label="Items" className="rounded-card border bg-card p-5">
          <h2 className="mb-2 text-lg font-semibold">Items</h2>
          <ul className="divide-y">
            {items.map((item, i) => (
              <li key={i} className="flex justify-between gap-3 py-2.5 text-sm tabular-nums">
                <span>{item.item_name} x{item.qty}</span>
                <span className="shrink-0">{formatVNDFull(item.amount)}</span>
              </li>
            ))}
            {taxes.map((t, i) => (
              <li key={`tax-${i}`} className="flex justify-between gap-3 py-2.5 text-sm tabular-nums text-muted-foreground">
                <span>{t.description}</span>
                <span className="shrink-0">{formatVNDFull(t.tax_amount)}</span>
              </li>
            ))}
            <li className="flex justify-between gap-3 py-2.5 font-semibold tabular-nums">
              <span>Total</span>
              <span>{formatVNDFull(invoice.grand_total)}</span>
            </li>
          </ul>
        </section>
      )}
    </div>
  );
}
