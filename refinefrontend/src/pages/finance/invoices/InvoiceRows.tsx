import { Link } from "react-router";
import { ArrowDown, ArrowUp, ChevronRight, ChevronsUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { formatVNDFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type Invoice, isoDate, statusVariant } from "./types";

export type SortKey = "posting_date" | "grand_total" | "outstanding_amount";
export interface Sort { key: SortKey; dir: "asc" | "desc" }

interface Row {
  invoice: Invoice;
  /** Wedding (project) name when the invoice links to one. */
  wedding: string | null;
  selected: boolean;
  onToggle: (name: string) => void;
}

const href = (i: Invoice) => `/finance/invoices/${encodeURIComponent(i.name)}`;

function TypeBadge({ category }: { category: string }) {
  if (!category) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={category === "Wedding Payment" ? "default" : "outline"} className="whitespace-nowrap">{category}</Badge>;
}

function SortHead({ label, k, sort, onSort, right }: { label: string; k: SortKey; sort: Sort; onSort: (k: SortKey) => void; right?: boolean }) {
  const active = sort.key === k;
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("px-3 py-3 font-semibold", right ? "text-right" : "text-left")}>
      <button type="button" onClick={() => onSort(k)} className={cn("inline-flex items-center gap-1 hover:text-foreground", right && "flex-row-reverse")}>
        {label}
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </button>
    </th>
  );
}

interface TableProps {
  rows: (Omit<Row, "selected" | "onToggle">)[];
  selected: Set<string>;
  onToggle: (name: string) => void;
  onToggleAll: (on: boolean) => void;
  sort: Sort;
  onSort: (k: SortKey) => void;
}

/** Desktop layout (D-Invoices.dc.html): sticky header, scrolls inside its own frame. */
export function InvoiceTable({ rows, selected, onToggle, onToggleAll, sort, onSort }: TableProps) {
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.invoice.name));
  return (
    <section className="overflow-hidden rounded-card border bg-card">
      <div className="max-h-[calc(100vh-22rem)] min-h-[16rem] overflow-auto">
        <table aria-label="Sales invoices" className="w-full min-w-[900px] border-collapse text-sm tabular-nums">
          <thead className="sticky top-0 z-10 bg-muted text-[13px] text-muted-foreground">
            <tr>
              <th scope="col" className="w-10 px-3 py-3">
                <Checkbox checked={allOn} onCheckedChange={(v) => onToggleAll(!!v)} aria-label="Select all shown invoices" />
              </th>
              <th scope="col" className="px-3 py-3 text-left font-semibold">Invoice</th>
              <th scope="col" className="px-3 py-3 text-left font-semibold">Customer / wedding</th>
              <th scope="col" className="px-3 py-3 text-left font-semibold">Type</th>
              <SortHead label="Date" k="posting_date" sort={sort} onSort={onSort} />
              <th scope="col" className="px-3 py-3 text-left font-semibold">Due</th>
              <SortHead label="Amount" k="grand_total" sort={sort} onSort={onSort} right />
              <SortHead label="Outstanding" k="outstanding_amount" sort={sort} onSort={onSort} right />
              <th scope="col" className="px-3 py-3 text-left font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ invoice: i, wedding }) => (
              <tr key={i.name} data-state={selected.has(i.name) ? "selected" : undefined} className="border-t hover:bg-muted/60 data-[state=selected]:bg-muted">
                <td className="px-3 py-3">
                  <Checkbox checked={selected.has(i.name)} onCheckedChange={() => onToggle(i.name)} aria-label={`Select ${i.name}`} />
                </td>
                <td className="whitespace-nowrap px-3 py-3">
                  <Link to={href(i)} className="font-medium text-primary hover:underline focus-visible:underline">{i.name}</Link>
                </td>
                <td className="min-w-[11rem] px-3 py-3">
                  <b className="font-medium">{i.customer_name}</b>
                  {wedding && <div className="text-xs text-muted-foreground">{wedding}</div>}
                </td>
                <td className="whitespace-nowrap px-3 py-3"><TypeBadge category={i.custom_invoice_category} /></td>
                <td className="whitespace-nowrap px-3 py-3">{isoDate(i.posting_date)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{isoDate(i.due_date)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right">{formatVNDFull(i.grand_total)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right">{formatVNDFull(i.outstanding_amount)}</td>
                <td className="px-3 py-3"><Badge variant={statusVariant(i.status)}>{i.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Phone layout: one card per invoice; the checkbox keeps bulk actions available. */
export function InvoiceCard({ invoice: i, wedding, selected, onToggle }: Row) {
  return (
    <div className={cn("flex items-stretch rounded-card border bg-card", selected && "border-primary")}>
      <label className="flex min-h-12 w-12 shrink-0 cursor-pointer items-start justify-center pt-4">
        <Checkbox checked={selected} onCheckedChange={() => onToggle(i.name)} aria-label={`Select ${i.name}`} />
      </label>
      <Link to={href(i)} className="flex min-w-0 flex-1 flex-col gap-2 py-4 pr-4 active:bg-muted">
        <div className="flex items-center justify-between gap-2">
          <b className="truncate">{i.customer_name}</b>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </div>
        {wedding && <p className="-mt-1 truncate text-sm text-muted-foreground">{wedding}</p>}
        <p className="text-sm text-muted-foreground tabular-nums">{i.name} · {isoDate(i.posting_date)}</p>
        <div className="flex items-end justify-between gap-2 tabular-nums">
          <div>
            <div className="font-semibold">{formatVNDFull(i.grand_total)}</div>
            <div className="text-xs text-muted-foreground">Outstanding {formatVNDFull(i.outstanding_amount)}</div>
          </div>
          <Badge variant={statusVariant(i.status)}>{i.status}</Badge>
        </div>
      </Link>
    </div>
  );
}
