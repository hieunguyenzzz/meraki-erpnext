import { useState } from "react";
import { Link, useParams } from "react-router";
import { useOne, usePermissions } from "@refinedev/core";
import { Pencil, RotateCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatePanel } from "@/components/StatePanel";
import { DetailSkeleton } from "@/components/detail-skeleton";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { formatVNDFull, formatVNDPlain } from "@/lib/format";
import { FINANCE_ROLES, hasModuleAccess } from "@/lib/roles";
import { DetailCard, Fact, Facts } from "./DetailCard";
import { DecisionCard } from "./expense-detail/DecisionCard";
import { ReceiptsCard } from "./expense-detail/ReceiptsCard";
import { EditExpenseSheet } from "./expenses/EditExpenseSheet";
import { useJson } from "./expenses/useExpenseData";
import { canEdit, categoryLabel, expenseStatus, isoDay, lockedNote, statusVariant, type Expense, type ExpenseCategory, type RowInfo } from "./expenses/types";

interface PurchaseItem { item_name: string; qty: number; rate: number; amount: number; expense_account?: string }

export default function ExpenseDetailPage() {
  const { name } = useParams<{ name: string }>();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [editing, setEditing] = useState(false);
  const { data: roles } = usePermissions<string[]>({});
  const { result: expense, query } = useOne({ resource: "Purchase Invoice", id: name! });
  const { result: projectDoc } = useOne({
    resource: "Project",
    id: expense?.project ?? "",
    queryOptions: { enabled: !!expense?.project },
    meta: { fields: ["name", "project_name", "expected_end_date"] },
  });
  // Description, staff name and note are resolved server-side (same endpoint as the list).
  const infoMap = useJson<Record<string, RowInfo>>("/inquiry-api/expense/descriptions", {}, "Expense descriptions");
  const categories = useJson<ExpenseCategory[]>("/inquiry-api/expense/categories", [], "Expense categories");

  if (query.isError) {
    console.error("Expense failed to load", name, query.error);
    return (
      <StatePanel kind="error" title="Couldn't load this expense" text="It may have been deleted, or the server didn't answer."
        action={{ label: "Try again", onClick: () => void query.refetch(), icon: <RotateCw className="h-4 w-4" /> }} />
    );
  }
  if (!expense) return <DetailSkeleton />;

  const record = expense as unknown as Expense;
  const items = (expense.items ?? []) as PurchaseItem[];
  const status = expenseStatus(record);
  const info = infoMap.data[expense.name];
  const category = categoryLabel(expense.against_expense_account || items[0]?.expense_account);
  const weddingLabel = [projectDoc?.project_name || expense.project, projectDoc?.expected_end_date ? isoDay(projectDoc.expected_end_date) : null].filter(Boolean).join(" · ");
  const canDecide = status === "Pending" && hasModuleAccess(roles ?? [], FINANCE_ROLES);

  return (
    <div className="flex flex-col gap-4 pb-6 md:gap-[18px]">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground md:hidden">
        <Link to="/finance/expenses" className="hover:text-foreground hover:underline">Expenses</Link> / {expense.name}
      </nav>

      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 basis-72">
          <h1 className="break-words text-2xl font-semibold leading-tight tabular-nums md:font-display md:text-[38px] md:leading-[42px]">{formatVNDFull(expense.grand_total)}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{expense.name}</span>
            <Badge variant={statusVariant(status)}>{status}</Badge>
          </div>
        </div>
        <span title={canEdit(record) ? undefined : lockedNote(record)}>
          <Button variant="outline" disabled={!canEdit(record)} onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        </span>
      </header>
      {!canEdit(record) && <p className="-mt-2 text-sm text-muted-foreground">{lockedNote(record)}</p>}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <div className="flex min-w-0 flex-col gap-4">
          <DetailCard title="Details">
            <Facts>
              <Fact label="Number">{expense.name}</Fact>
              <Fact label="Date">{isoDay(expense.posting_date)}</Fact>
              {/* "Company Expense" is the backend default for wedding expenses, so it says nothing. */}
              {expense.supplier_name && expense.supplier_name !== "Company Expense" && <Fact label="Supplier">{expense.supplier_name}</Fact>}
              {expense.project && (
                <Fact label="Wedding">
                  <Link to={`/projects/${encodeURIComponent(expense.project)}`} className="text-primary hover:underline">{weddingLabel}</Link>
                </Fact>
              )}
              {category && <Fact label="Category">{category}</Fact>}
              {info?.staff && <Fact label="Staff">{info.staff}</Fact>}
              {info?.description && <Fact label="Description">{info.description}</Fact>}
              {info?.note && <Fact label="Note">{info.note}</Fact>}
              {status === "Rejected" && info?.rejected_reason && <Fact label="Rejection reason">{info.rejected_reason}</Fact>}
              {expense.docstatus === 1 && expense.outstanding_amount > 0 && <Fact label="Outstanding">{formatVNDFull(expense.outstanding_amount)}</Fact>}
            </Facts>
            {infoMap.error && <p role="alert" className="text-xs text-danger-soft-foreground">Staff and description didn't load. {infoMap.error}</p>}
          </DetailCard>

          {items.length > 0 && (
            <DetailCard title="Line items">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm tabular-nums">
                  <thead className="text-[13px] text-muted-foreground">
                    <tr>
                      <th scope="col" className="py-2.5 text-left font-semibold">Item</th>
                      <th scope="col" className="py-2.5 text-right font-semibold">Qty</th>
                      <th scope="col" className="py-2.5 text-right font-semibold">Amount (VND)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => (
                      <tr key={i} className="border-t">
                        <td className="break-words py-3 pr-3">{item.item_name}</td>
                        <td className="py-3 text-right">{item.qty}</td>
                        <td className="py-3 text-right">{formatVNDPlain(item.amount)}</td>
                      </tr>
                    ))}
                    <tr className="border-t font-bold">
                      <td className="py-3">Total</td><td />
                      <td className="py-3 text-right">{formatVNDPlain(expense.grand_total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </DetailCard>
          )}

          {canDecide && <DecisionCard piName={expense.name} staffName={info?.staff} onDecided={infoMap.reload} />}
        </div>

        <ReceiptsCard piName={expense.name} />
      </div>

      <EditExpenseSheet
        key={editing ? expense.name : "none"}
        expense={editing ? record : null}
        info={info}
        categories={categories.data}
        weddingName={projectDoc?.project_name}
        isDesktop={isDesktop}
        onClose={() => setEditing(false)}
        onSaved={() => { setEditing(false); void query.refetch(); infoMap.reload(); }}
      />
    </div>
  );
}
