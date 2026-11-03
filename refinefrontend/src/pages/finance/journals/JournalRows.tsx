import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { formatVNDFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type JournalEntry, isoDate, statusOf, statusVariant, typeVariant } from "./types";

export type SortKey = "posting_date" | "total_debit" | "total_credit";
export interface Sort { key: SortKey; dir: "asc" | "desc" }

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
  rows: JournalEntry[];
  selected: Set<string>;
  onToggle: (name: string) => void;
  onToggleAll: (on: boolean) => void;
  sort: Sort;
  onSort: (k: SortKey) => void;
}

/** Desktop layout (D-Journals.dc.html): sticky header, scrolls inside its own frame. */
export function JournalTable({ rows, selected, onToggle, onToggleAll, sort, onSort }: TableProps) {
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.name));
  const someOn = !allOn && rows.some((r) => selected.has(r.name));
  return (
    <section className="overflow-hidden rounded-card border bg-card">
      <div className="max-h-[calc(100vh-22rem)] min-h-[16rem] overflow-auto">
        <table aria-label="Journal entries" className="w-full min-w-[900px] border-collapse text-sm tabular-nums">
          <thead className="sticky top-0 z-10 bg-muted text-[13px] text-muted-foreground">
            <tr>
              <th scope="col" className="w-10 px-3 py-3">
                <Checkbox checked={allOn ? true : someOn ? "indeterminate" : false} onCheckedChange={(v) => onToggleAll(!!v)} aria-label="Select all shown entries" />
              </th>
              <th scope="col" className="px-3 py-3 text-left font-semibold">Entry</th>
              <SortHead label="Date" k="posting_date" sort={sort} onSort={onSort} />
              <th scope="col" className="px-3 py-3 text-left font-semibold">Type</th>
              <SortHead label="Debit" k="total_debit" sort={sort} onSort={onSort} right />
              <SortHead label="Credit" k="total_credit" sort={sort} onSort={onSort} right />
              <th scope="col" className="px-3 py-3 text-left font-semibold">Status</th>
              <th scope="col" className="px-3 py-3 text-left font-semibold">Remark</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((j) => (
              <tr key={j.name} data-state={selected.has(j.name) ? "selected" : undefined} className="border-t hover:bg-muted/60 data-[state=selected]:bg-muted">
                <td className="px-3 py-3">
                  <Checkbox checked={selected.has(j.name)} onCheckedChange={() => onToggle(j.name)} aria-label={`Select ${j.name}`} />
                </td>
                <td className="whitespace-nowrap px-3 py-3 font-medium">{j.name}</td>
                <td className="whitespace-nowrap px-3 py-3">{isoDate(j.posting_date)}</td>
                <td className="whitespace-nowrap px-3 py-3"><Badge variant={typeVariant(j.voucher_type)} className="whitespace-nowrap">{j.voucher_type}</Badge></td>
                <td className="whitespace-nowrap px-3 py-3 text-right">{formatVNDFull(j.total_debit)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right">{formatVNDFull(j.total_credit)}</td>
                <td className="px-3 py-3"><Badge variant={statusVariant(j.docstatus)}>{statusOf(j.docstatus)}</Badge></td>
                <td className="max-w-[16rem] truncate px-3 py-3 text-muted-foreground" title={j.user_remark || undefined}>{j.user_remark || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Phone layout: one card per entry; the checkbox keeps bulk delete available. */
export function JournalCard({ entry: j, selected, onToggle }: { entry: JournalEntry; selected: boolean; onToggle: (name: string) => void }) {
  return (
    <div className={cn("flex items-stretch rounded-card border bg-card", selected && "border-primary")}>
      <label className="flex min-h-12 w-12 shrink-0 cursor-pointer items-start justify-center pt-4">
        <Checkbox checked={selected} onCheckedChange={() => onToggle(j.name)} aria-label={`Select ${j.name}`} />
      </label>
      <div className="flex min-w-0 flex-1 flex-col gap-2 py-4 pr-4">
        <div className="flex items-center justify-between gap-2">
          <b className="truncate">{j.name}</b>
          <Badge variant={statusVariant(j.docstatus)}>{statusOf(j.docstatus)}</Badge>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
          <span>{isoDate(j.posting_date)}</span>
          <Badge variant={typeVariant(j.voucher_type)} className="whitespace-nowrap">{j.voucher_type}</Badge>
        </div>
        {j.user_remark && <p className="line-clamp-2 text-sm text-muted-foreground">{j.user_remark}</p>}
        <div className="grid grid-cols-2 gap-2 tabular-nums">
          <div><div className="text-xs text-muted-foreground">Debit</div><div className="font-semibold">{formatVNDFull(j.total_debit)}</div></div>
          <div><div className="text-xs text-muted-foreground">Credit</div><div className="font-semibold">{formatVNDFull(j.total_credit)}</div></div>
        </div>
      </div>
    </div>
  );
}
