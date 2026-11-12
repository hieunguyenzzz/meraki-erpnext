import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useList } from "@refinedev/core";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { RotateCw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatePanel } from "@/components/StatePanel";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { JournalCard, JournalTable, type Sort, type SortKey } from "./journals/JournalRows";
import { useJournalDelete } from "./journals/useJournalDelete";
import { STATUS_FILTERS, TYPE_FILTERS, parseAsIsoDate, statusOf, type JournalEntry } from "./journals/types";

const PAGE = 50;
const ALL = "all";
const opts = { clearOnDefault: true };

export default function JournalsPage() {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  // Filters live in the URL so Back restores them; junk values fall back to the defaults.
  const [status, setStatus] = useQueryState("status", parseAsStringLiteral(STATUS_FILTERS).withDefault(ALL).withOptions(opts));
  const [type, setType] = useQueryState("type", parseAsStringLiteral(TYPE_FILTERS).withDefault(ALL).withOptions(opts));
  const [from, setFrom] = useQueryState("from", parseAsIsoDate.withDefault("").withOptions(opts));
  const [to, setTo] = useQueryState("to", parseAsIsoDate.withDefault("").withOptions(opts));
  const [search, setSearch] = useQueryState("q", parseAsString.withDefault("").withOptions(opts));

  const [sort, setSort] = useState<Sort>({ key: "posting_date", dir: "desc" });
  const [shown, setShown] = useState(PAGE);
  const [rowSelection, setRowSelection] = useState<Set<string>>(new Set());

  const { result, query } = useList<JournalEntry>({
    resource: "Journal Entry",
    pagination: { mode: "off" },
    sorters: [{ field: "posting_date", order: "desc" }],
    meta: { fields: ["name", "posting_date", "voucher_type", "total_debit", "total_credit", "user_remark", "docstatus"] },
  });

  const journals = useMemo(() => (result?.data ?? []) as JournalEntry[], [result]);

  // Search, type and date range narrow the set; the status chips count within it.
  const deferredSearch = useDeferredValue(search);
  const scoped = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return journals.filter((j) => {
      if (type !== ALL && j.voucher_type !== type) return false;
      const d = j.posting_date?.slice(0, 10) ?? "";
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (!q) return true;
      return [j.name, j.user_remark ?? ""].some((v) => v.toLowerCase().includes(q));
    });
  }, [journals, deferredSearch, type, from, to]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { [ALL]: scoped.length };
    for (const j of scoped) {
      const s = statusOf(j.docstatus);
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [scoped]);

  const rows = useMemo(() => {
    const list = scoped.filter((j) => status === ALL || statusOf(j.docstatus) === status);
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sort.key] ?? 0;
      const bv = b[sort.key] ?? 0;
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  }, [scoped, status, sort]);

  const visible = rows.slice(0, shown);
  // Only entries on screen can be deleted, so a filter change never leaves hidden rows selected.
  const selectedNames = visible.filter((j) => rowSelection.has(j.name)).map((j) => j.name);
  const del = useJournalDelete(selectedNames, (failed) => setRowSelection(new Set(failed)));

  function resetShown<T>(setter: (v: T) => unknown) {
    return (v: T) => { setShown(PAGE); void setter(v); };
  }
  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  const toggle = (name: string) =>
    setRowSelection((prev) => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  const toggleAll = (on: boolean) =>
    setRowSelection((prev) => { const n = new Set(prev); visible.forEach((j) => (on ? n.add(j.name) : n.delete(j.name))); return n; });

  useEffect(() => {
    if (query.isError) console.error("Journal entries list failed to load", query.error);
  }, [query.isError, query.error]);
  const loadError = query.isError && journals.length === 0;
  const filtered = search.trim() !== "" || type !== ALL || status !== ALL || from !== "" || to !== "";

  let body;
  if (loadError) {
    body = (
      <StatePanel
        kind="error"
        title="Couldn't load journal entries"
        text="The server didn't answer. Your data is safe."
        action={{ label: "Try again", onClick: () => void query.refetch(), icon: <RotateCw className="h-4 w-4" /> }}
      />
    );
  } else if (query.isLoading) {
    body = (
      <div className="flex flex-col gap-3" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-card md:h-12" />)}
      </div>
    );
  } else if (rows.length === 0) {
    body = (
      <StatePanel
        kind="empty"
        title={filtered ? "No entries match" : "No journal entries yet"}
        text={filtered ? "Try a different search, type, status or date range." : "Entries appear here once accounting postings are made."}
      />
    );
  } else {
    body = (
      <>
        {isDesktop ? (
          <JournalTable rows={visible} selected={rowSelection} onToggle={toggle} onToggleAll={toggleAll} sort={sort} onSort={onSort} />
        ) : (
          <div className="flex flex-col gap-3">
            {visible.map((j) => <JournalCard key={j.name} entry={j} selected={rowSelection.has(j.name)} onToggle={toggle} />)}
          </div>
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold leading-tight md:font-display md:text-4xl md:leading-10">Journal entries</h1>
          <p className="text-sm text-muted-foreground">Manual accounting entries and adjustments</p>
        </div>
        {selectedNames.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{selectedNames.length} selected</span>
            <Button variant="destructive" disabled={del.deleting} onClick={() => void del.deleteSelected()} className="max-md:h-12">
              <Trash2 className="mr-1.5 h-4 w-4" />
              {del.deleting ? "Deleting..." : "Delete selected"}
            </Button>
          </div>
        )}
      </div>

      {del.error && (
        <div role="alert" className="flex items-center justify-between rounded-md border border-destructive/30 bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">
          <span>{del.error}</span>
          <button type="button" onClick={del.clearError} aria-label="Dismiss" className="ml-4 flex h-8 w-8 items-center justify-center font-medium max-md:h-12 max-md:w-12">&times;</button>
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
        <div className="relative md:w-80">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label="Search journal entries"
            placeholder="Search entries"
            value={search}
            onChange={(e) => resetShown(setSearch)(e.target.value)}
            className="rounded-full pl-10 max-md:h-12 max-md:pl-10"
          />
        </div>
        <Select value={type} onValueChange={(v) => resetShown(setType)(v as (typeof TYPE_FILTERS)[number])}>
          <SelectTrigger aria-label="Filter by type" className="rounded-full max-md:h-12 md:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            <SelectItem value="Journal Entry">Journal Entry</SelectItem>
            <SelectItem value="Bank Entry">Bank Entry</SelectItem>
            <SelectItem value="Cash Entry">Cash Entry</SelectItem>
          </SelectContent>
        </Select>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 md:flex">
          <Input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => resetShown(setFrom)(e.target.value)} className="min-w-0 rounded-full max-md:h-12 md:w-40" />
          <span className="text-muted-foreground" aria-hidden>–</span>
          <Input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => resetShown(setTo)(e.target.value)} className="min-w-0 rounded-full max-md:h-12 md:w-40" />
        </div>
      </div>

      <div role="group" aria-label="Filter by status" className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {STATUS_FILTERS.map((s) => {
          const on = status === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => resetShown(setStatus)(s)}
              className={cn(
                "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium max-md:h-12",
                on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
              )}
            >
              {s === ALL ? "All" : s}
              <span className={cn("tabular-nums", on ? "opacity-90" : "text-muted-foreground")}>{counts[s] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {body}
    </div>
  );
}
