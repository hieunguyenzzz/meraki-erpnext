import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { BadgeCheck, ChevronDown, Plus, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { StatePanel } from "@/components/StatePanel";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { formatVNDFull } from "@/lib/format";
import { EditExpenseSheet } from "./expenses/EditExpenseSheet";
import { ExpenseCard, ExpenseTableRow } from "./expenses/ExpenseRows";
import { ExpenseFilters } from "./expenses/ExpenseFilters";
import { QuickExpenseSheet } from "./expenses/QuickExpenseSheet";
import { SupplierInvoiceSheet } from "./expenses/SupplierInvoiceSheet";
import { filterExpenses, useExpenseFilters, type Filters } from "./expenses/filters";
import { useBulkActions } from "./expenses/useBulkActions";
import { useExpenseData } from "./expenses/useExpenseData";
import { categoryLabel, type Expense } from "./expenses/types";

const PAGE = 50;

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading expenses">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-card" />)}
    </div>
  );
}

export default function ExpensesPage() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const data = useExpenseData();
  const [params, setParams] = useExpenseFilters();
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Expense | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const { expenses, info, weddingNames, receipts, receiptsKnown } = data;

  // Option lists come from the data; a URL value that is not among them is ignored.
  const categoryOptions = useMemo(() => {
    const used = new Set(expenses.map((e) => e.against_expense_account).filter(Boolean));
    return [...used].sort().map((a) => ({ value: a, label: categoryLabel(a) }));
  }, [expenses]);
  const weddingOptions = useMemo(() => {
    const used = new Set(expenses.map((e) => e.project).filter(Boolean));
    return [...used].map((p) => ({ value: p, label: weddingNames[p] || p })).sort((a, b) => a.label.localeCompare(b.label));
  }, [expenses, weddingNames]);
  const staffOptions = useMemo(() => [...new Set(Object.values(info).map((i) => i.staff).filter(Boolean))].sort(), [info]);

  const filters: Filters = useMemo(() => ({
    ...params,
    category: categoryOptions.some((o) => o.value === params.category) ? params.category : "",
    wedding: weddingOptions.some((o) => o.value === params.wedding) ? params.wedding : "",
    staff: staffOptions.includes(params.staff) ? params.staff : "",
  }), [params, categoryOptions, weddingOptions, staffOptions]);

  const withReceipt = useMemo(() => (receiptsKnown ? new Set(Object.keys(receipts)) : null), [receipts, receiptsKnown]);
  const rows = useMemo(
    () => filterExpenses(expenses, filters, { info, weddingNames, withReceipt }),
    [expenses, filters, info, weddingNames, withReceipt],
  );
  const missingCount = withReceipt ? expenses.filter((e) => !withReceipt.has(e.name)).length : null;
  const total = useMemo(() => rows.reduce((s, e) => s + (e.grand_total || 0), 0), [rows]);

  // Selection only ever covers rows currently listed, so a bulk action never touches hidden ones.
  const selectedNames = useMemo(() => rows.filter((r) => selection[r.name]).map((r) => r.name), [rows, selection]);
  const bulk = useBulkActions(() => setSelection({}));
  const bulkBusy = bulk.action !== null;

  useEffect(() => { setShown(PAGE); }, [filters]);

  const change = (patch: Partial<Filters>) => void setParams(patch);
  const visible = rows.slice(0, shown);
  const filtered = Object.entries(filters).some(([, v]) => v !== "" && v !== null);

  if (data.error) console.error("Expenses list failed to load", data.error);

  const rowProps = (e: Expense) => ({
    expense: e,
    info: info[e.name],
    weddingName: weddingNames[e.project],
    receipt: receipts[e.name],
    receiptsKnown,
    selected: !!selection[e.name],
    onSelect: (checked: boolean) => setSelection((s) => ({ ...s, [e.name]: checked })),
    onEdit: () => setEditing(e),
  });

  let body;
  if (data.error) {
    body = <StatePanel kind="error" title="Couldn't load expenses" text="The server didn't answer. Your data is safe."
      action={{ label: "Try again", onClick: data.refetch, icon: <RotateCw className="h-4 w-4" /> }} />;
  } else if (data.loading) {
    body = <ListSkeleton />;
  } else if (rows.length === 0) {
    body = <StatePanel kind="empty" title={filtered ? "No expenses match" : "No expenses yet"}
      text={filtered ? "Try different filters or clear them." : "Add an expense to see it here."} />;
  } else if (isDesktop) {
    body = (
      <section className="overflow-hidden rounded-card border bg-card">
        <div className="overflow-x-auto">
          <table aria-label="Expenses" className="w-full min-w-[960px] border-collapse text-sm">
            <thead className="bg-muted text-[13px] text-muted-foreground">
              <tr>
                <th scope="col" className="w-12 px-4 py-3 text-left">
                  <Checkbox aria-label="Select all listed"
                    checked={selectedNames.length > 0 && selectedNames.length === visible.length ? true : selectedNames.length > 0 ? "indeterminate" : false}
                    onCheckedChange={(v) => setSelection(v ? Object.fromEntries(visible.map((r) => [r.name, true])) : {})} />
                </th>
                {["Date", "Description", "Wedding", "Category", "Staff", "Bill", "Status"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-3 text-left font-semibold">{h}</th>
                ))}
                <th scope="col" className="px-3 py-3 text-right font-semibold">Amount</th>
                <th scope="col" className="w-14 px-3 py-3"><span className="sr-only">Edit</span></th>
              </tr>
            </thead>
            <tbody>{visible.map((e) => <ExpenseTableRow key={e.name} {...rowProps(e)} />)}</tbody>
          </table>
        </div>
      </section>
    );
  } else {
    body = <div className="flex flex-col gap-3">{visible.map((e) => <ExpenseCard key={e.name} {...rowProps(e)} />)}</div>;
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 basis-48">
          <h1 className="text-2xl font-semibold leading-tight md:font-display md:text-4xl md:leading-10">Expenses</h1>
          {!data.loading && !data.error && (
            <p className="text-sm text-muted-foreground">
              {rows.length} {rows.length === 1 ? "expense" : "expenses"} · {formatVNDFull(total)}
            </p>
          )}
        </div>
        <Button asChild className="max-md:h-12">
          <Link to="/finance/expenses/new"><Plus className="mr-1 h-4 w-4" /> Add expense</Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" aria-label="More ways to add an expense" className="max-md:h-12">More <ChevronDown className="ml-1 h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setQuickOpen(true)}>Quick expense (approved)</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setSupplierOpen(true)}>Supplier invoice</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <ExpenseFilters filters={filters} onChange={change} categories={categoryOptions} weddings={weddingOptions}
        staff={staffOptions} missingCount={missingCount} isDesktop={isDesktop} />

      {data.infoError && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-card bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
          <span>Descriptions and staff names didn't load. {data.infoError}</span>
          <Button size="sm" variant="outline" onClick={data.reloadInfo}>Retry</Button>
        </div>
      )}

      {bulk.error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-card bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">
          <span>{bulk.error}</span>
          <button type="button" onClick={bulk.clearError} aria-label="Dismiss" className="flex h-11 w-11 items-center justify-center text-lg">&times;</button>
        </div>
      )}

      {selectedNames.length > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-card border bg-card p-2 pl-4 shadow-md">
          <b className="mr-auto text-sm">{selectedNames.length} selected</b>
          <Button variant="outline" disabled={bulkBusy} onClick={() => void bulk.run("paying", selectedNames)} className="max-md:h-12">
            <BadgeCheck className="mr-1.5 h-4 w-4" /> {bulk.action === "paying" ? "Paying..." : "Mark paid"}
          </Button>
          <Button variant="destructive" disabled={bulkBusy} onClick={() => void bulk.run("deleting", selectedNames)} className="max-md:h-12">
            <Trash2 className="mr-1.5 h-4 w-4" /> {bulk.action === "deleting" ? "Deleting..." : "Delete"}
          </Button>
        </div>
      )}

      {body}

      {rows.length > shown && (
        <Button variant="outline" onClick={() => setShown((n) => n + PAGE)} className="mx-auto max-md:h-12">
          Show more ({rows.length - shown} left)
        </Button>
      )}

      <EditExpenseSheet
        key={editing?.name ?? "none"}
        expense={editing}
        info={editing ? info[editing.name] : undefined}
        categories={data.categories}
        weddingName={editing ? weddingNames[editing.project] : undefined}
        isDesktop={isDesktop}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); setSelection({}); data.reloadInfo(); }}
      />
      <QuickExpenseSheet open={quickOpen} onOpenChange={setQuickOpen} weddings={data.allWeddings} isDesktop={isDesktop} onCategoryCreated={data.reloadCategories} />
      <SupplierInvoiceSheet open={supplierOpen} onOpenChange={setSupplierOpen} categories={data.categories} isDesktop={isDesktop} />
    </div>
  );
}
