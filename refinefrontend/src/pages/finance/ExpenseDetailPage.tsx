import { Link, useParams } from "react-router";
import { useOne } from "@refinedev/core";
import { ArrowLeft, RotateCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatePanel } from "@/components/StatePanel";
import { DetailSkeleton } from "@/components/detail-skeleton";
import { formatVNDFull } from "@/lib/format";
import { ReceiptsCard } from "./expense-detail/ReceiptsCard";
import { categoryLabel, expenseStatus, isoDay, statusVariant, type Expense } from "./expenses/types";

interface PurchaseItem { item_name: string; qty: number; rate: number; amount: number; expense_account?: string }

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-3 last:border-b-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right">{children}</dd>
    </div>
  );
}

export default function ExpenseDetailPage() {
  const { name } = useParams<{ name: string }>();
  const { result: expense, query } = useOne({ resource: "Purchase Invoice", id: name! });
  const { result: projectDoc } = useOne({
    resource: "Project",
    id: expense?.project ?? "",
    queryOptions: { enabled: !!expense?.project },
  });

  if (query.isError) {
    console.error("Expense failed to load", name, query.error);
    return (
      <StatePanel kind="error" title="Couldn't load this expense" text="It may have been deleted, or the server didn't answer."
        action={{ label: "Try again", onClick: () => void query.refetch(), icon: <RotateCw className="h-4 w-4" /> }} />
    );
  }
  if (!expense) return <DetailSkeleton />;

  const items = (expense.items ?? []) as PurchaseItem[];
  const status = expenseStatus(expense as unknown as Expense);
  const weddingLabel = projectDoc?.project_name || expense.project;
  const category = categoryLabel(items[0]?.expense_account);

  return (
    <div className="flex flex-col gap-4 pb-6">
      <Link to="/finance/expenses" className="inline-flex min-h-12 w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground md:min-h-0">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Expenses
      </Link>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 break-words text-2xl font-semibold leading-tight md:font-display md:text-4xl md:leading-10">{expense.name}</h1>
        <Badge variant={statusVariant(status)}>{status}</Badge>
      </header>

      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <section className="rounded-card border bg-card p-4 md:p-5" aria-labelledby="details-title">
          <h2 id="details-title" className="font-display text-2xl font-semibold">Expense details</h2>
          <p className="mt-2 text-3xl font-bold tabular-nums">{formatVNDFull(expense.grand_total)}</p>
          <dl className="mt-2">
            <Fact label="Supplier">{expense.supplier_name || expense.supplier}</Fact>
            <Fact label="Date"><span className="tabular-nums">{isoDay(expense.posting_date)}</span></Fact>
            {category && <Fact label="Category">{category}</Fact>}
            <Fact label="Outstanding"><span className="tabular-nums">{formatVNDFull(expense.outstanding_amount)}</span></Fact>
            {expense.project && (
              <Fact label="Wedding">
                <Link to={`/projects/${encodeURIComponent(expense.project)}`} className="text-primary hover:underline">{weddingLabel}</Link>
              </Fact>
            )}
          </dl>
        </section>

        {items.length > 0 && (
          <section className="rounded-card border bg-card p-4 md:p-5" aria-labelledby="items-title">
            <h2 id="items-title" className="font-display text-2xl font-semibold">Items</h2>
            <ul className="mt-2">
              {items.map((item, i) => (
                <li key={i} className="flex items-start justify-between gap-4 border-b py-3 last:border-b-0">
                  <div className="min-w-0">
                    <p className="break-words font-medium">{item.item_name}</p>
                    <p className="text-sm text-muted-foreground tabular-nums">{item.qty} × {formatVNDFull(item.rate)}</p>
                  </div>
                  <b className="shrink-0 tabular-nums">{formatVNDFull(item.amount)}</b>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <ReceiptsCard piName={name!} />
    </div>
  );
}
