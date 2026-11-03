import { Link } from "react-router";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatVNDFull } from "@/lib/format";
import type { Receipt } from "./useExpenseData";
import { canEdit, categoryLabel, expenseStatus, lockedNote, isoDay, statusVariant, type Expense, type RowInfo } from "./types";

export interface RowProps {
  expense: Expense;
  info?: RowInfo;
  weddingName?: string;
  receipt?: Receipt;
  /** false while receipts are loading or failed: no "Missing" badge then. */
  receiptsKnown: boolean;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onEdit: () => void;
}

const href = (e: Expense) => `/finance/expenses/${encodeURIComponent(e.name)}`;
const title = (p: RowProps) => p.info?.description || p.expense.supplier_name || p.expense.name;

export function StatusBadge({ expense }: { expense: Expense }) {
  const s = expenseStatus(expense);
  return <Badge variant={statusVariant(s)}>{s}</Badge>;
}

export function ReceiptThumb({ receipt, known, size }: { receipt?: Receipt; known: boolean; size: "sm" | "md" }) {
  const box = size === "md" ? "h-14 w-14" : "h-10 w-10";
  if (receipt?.isImage) {
    return <img src={receipt.url} alt="Receipt" loading="lazy" className={`${box} shrink-0 rounded-md border object-cover`} />;
  }
  if (receipt) {
    return <span className={`${box} flex shrink-0 items-center justify-center rounded-md border bg-muted text-xs font-semibold text-muted-foreground`}>File</span>;
  }
  if (!known) return null;
  return <Badge variant="warning">Missing</Badge>;
}

export function ExpenseTableRow(p: RowProps) {
  const { expense: e, info } = p;
  return (
    <tr className="border-t align-middle">
      <td className="w-12 px-4 py-3">
        <Checkbox checked={p.selected} onCheckedChange={(v) => p.onSelect(!!v)} aria-label={`Select ${e.name}`} />
      </td>
      <td className="whitespace-nowrap px-3 py-3 tabular-nums">{isoDay(e.posting_date)}</td>
      <td className="max-w-[280px] px-3 py-3">
        <Link to={href(e)} className="block truncate font-medium text-primary hover:underline focus-visible:underline" title={title(p)}>{title(p)}</Link>
        <span className="text-xs text-muted-foreground">{e.name}</span>
        {info?.note && <div className="line-clamp-2 text-xs text-muted-foreground" title={info.note}>{info.note}</div>}
      </td>
      <td className="px-3 py-3">
        {e.project ? (
          <Link to={`/projects/${encodeURIComponent(e.project)}`} className="text-primary hover:underline">{p.weddingName || e.project}</Link>
        ) : <span className="text-muted-foreground">—</span>}
      </td>
      <td className="min-w-[7rem] px-3 py-3">{categoryLabel(e.against_expense_account) || <span className="text-muted-foreground">—</span>}</td>
      <td className="px-3 py-3">{info?.staff || <span className="text-muted-foreground">—</span>}</td>
      <td className="px-3 py-3"><ReceiptThumb receipt={p.receipt} known={p.receiptsKnown} size="sm" /></td>
      <td className="px-3 py-3"><StatusBadge expense={e} /></td>
      <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">{formatVNDFull(e.grand_total)}</td>
      <td className="px-3 py-3">
        <span title={canEdit(e) ? undefined : lockedNote(e)}>
          <Button variant="ghost" size="icon" onClick={p.onEdit} disabled={!canEdit(e)} aria-label={canEdit(e) ? `Edit ${e.name}` : `Edit ${e.name} (locked: ${lockedNote(e)})`}><Pencil className="h-4 w-4" /></Button>
        </span>
      </td>
    </tr>
  );
}

export function ExpenseCard(p: RowProps) {
  const { expense: e, info } = p;
  const meta = [categoryLabel(e.against_expense_account), p.weddingName || e.project, info?.staff].filter(Boolean).join(" · ");
  return (
    <article className="flex gap-1 rounded-card border bg-card p-2 pr-3">
      <label className="flex h-12 w-12 shrink-0 items-center justify-center">
        <Checkbox checked={p.selected} onCheckedChange={(v) => p.onSelect(!!v)} aria-label={`Select ${e.name}`} />
      </label>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-2">
        <div className="flex items-start justify-between gap-3">
          <Link to={href(e)} className="min-w-0 break-words font-semibold leading-snug">{title(p)}</Link>
          {(p.receipt || p.receiptsKnown) && (
            <Link to={href(e)} className="shrink-0" aria-label={`Open ${e.name}`}>
              <ReceiptThumb receipt={p.receipt} known={p.receiptsKnown} size="md" />
            </Link>
          )}
        </div>
        <b className="text-lg tabular-nums">{formatVNDFull(e.grand_total)}</b>
        {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
        {info?.note && <p className="line-clamp-2 text-xs text-muted-foreground">{info.note}</p>}
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="tabular-nums">{isoDay(e.posting_date)}</span>
          <StatusBadge expense={e} />
        </div>
        {canEdit(e) ? (
          <Button variant="outline" size="sm" onClick={p.onEdit} className="mt-1 w-fit max-md:h-12">
            <Pencil className="mr-1.5 h-4 w-4" /> Edit
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">{lockedNote(e)}</p>
        )}
      </div>
    </article>
  );
}
