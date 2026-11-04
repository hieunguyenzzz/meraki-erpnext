import { useParams, Link } from "react-router";
import { useOne } from "@refinedev/core";
import { RotateCw } from "lucide-react";
import { formatVNDFull } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { StatePanel } from "@/components/StatePanel";
import { DetailSkeleton } from "@/components/detail-skeleton";
import { cn } from "@/lib/utils";
import { DetailCard, Fact, Facts } from "./DetailCard";
import { LinkedPaymentsCard } from "./invoice-detail/LinkedPaymentsCard";
import { LineItemsCard, type InvoiceItem, type InvoiceTax } from "./invoice-detail/LineItemsCard";
import { isoDate, overdueDays, statusVariant } from "./invoices/types";

function Stat({ label, value, tone }: { label: string; value: string; tone?: "paid" | "due" }) {
  return (
    <div className={cn("flex flex-col gap-0.5 rounded-card border bg-card p-5", tone === "due" && "border-danger-soft-foreground/25")}>
      <span className={cn("text-[13px] text-muted-foreground", tone === "due" && "font-semibold text-danger-soft-foreground")}>{label}</span>
      <b className={cn("text-2xl tabular-nums md:text-[26px]", tone === "paid" && "text-success")}>{value}</b>
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
    meta: { fields: ["name", "project_name", "expected_end_date"] },
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
  const linkedSalesOrder = (invoice.items as { sales_order?: string }[] | undefined)?.find((item) => item.sales_order)?.sales_order;
  const late = overdueDays({ docstatus: invoice.docstatus, due_date: invoice.due_date, outstanding_amount: invoice.outstanding_amount });
  // ERPNext reports any past-due invoice as "Overdue"; the days badge says that, so the status badge says how far it is paid.
  const statusLabel = late !== null && invoice.status === "Overdue" ? (invoice.outstanding_amount < invoice.grand_total ? "Partly paid" : "Unpaid") : invoice.status;
  const weddingLabel = [project?.project_name || projectId, project?.expected_end_date ? isoDate(project.expected_end_date) : null].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-4 pb-6 md:gap-[18px]">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground md:hidden">
        <Link to="/finance/invoices" className="hover:text-foreground hover:underline">Invoices</Link> / {invoice.name}
      </nav>

      <header className="flex flex-col gap-1.5">
        <h1 className="break-words text-2xl font-semibold leading-tight md:font-display md:text-[38px] md:leading-[42px]">{invoice.name}</h1>
        <div className="flex flex-wrap gap-2">
          <Badge variant={statusVariant(statusLabel)}>{statusLabel}</Badge>
          {late !== null && <Badge variant="destructive">Overdue · {late} d</Badge>}
        </div>
      </header>

      <section aria-label="Amounts" className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total" value={formatVNDFull(invoice.grand_total)} />
        {/* Paid is derived (grand_total - outstanding): Sales Invoice has no paid field. It can differ from the Linked payments sum when credit notes or journal entries settle part of the invoice. */}
        <Stat label="Paid" value={formatVNDFull(invoice.grand_total - invoice.outstanding_amount)} tone="paid" />
        <Stat label="Outstanding" value={formatVNDFull(invoice.outstanding_amount)} tone={late !== null ? "due" : undefined} />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <DetailCard title="Details">
          <Facts>
            <Fact label="Number">{invoice.name}</Fact>
            <Fact label="Customer">{invoice.customer_name || "—"}</Fact>
            <Fact label="Wedding">
              {projectId ? (
                <Link to={`/projects/${encodeURIComponent(projectId)}`} className="font-medium text-primary hover:underline">{weddingLabel}</Link>
              ) : "—"}
            </Fact>
            {invoice.custom_invoice_category && <Fact label="Type">{invoice.custom_invoice_category}</Fact>}
            {linkedSalesOrder && <Fact label="Sales order">{linkedSalesOrder}</Fact>}
            <Fact label="Issued">{isoDate(invoice.posting_date)}</Fact>
            <Fact label="Due">{isoDate(invoice.due_date)}</Fact>
          </Facts>
        </DetailCard>

        <LinkedPaymentsCard invoiceName={invoice.name} outstanding={invoice.outstanding_amount} collectable={invoice.docstatus === 1} />

        {(items.length > 0 || taxes.length > 0) && <LineItemsCard items={items} taxes={taxes} total={invoice.grand_total} />}
      </div>
    </div>
  );
}
