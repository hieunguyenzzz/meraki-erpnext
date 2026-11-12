import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useList, useInvalidate } from "@refinedev/core";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { ChevronDown, Plus, RotateCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatePanel } from "@/components/StatePanel";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { InvoiceCard, InvoiceTable, type Sort, type SortKey } from "./invoices/InvoiceRows";
import { ReferralSheet, type WeddingOption } from "./invoices/ReferralSheet";
import { useInvoiceActions } from "./invoices/useInvoiceActions";
import { STATUS_FILTERS, TYPE_FILTERS, type Invoice } from "./invoices/types";

const PAGE = 50;
const ALL = "all";

export default function InvoicesPage() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const invalidate = useInvalidate();

  // Filters live in the URL so Back restores them; junk values fall back to the defaults.
  const [status, setStatus] = useQueryState("status", parseAsStringLiteral(STATUS_FILTERS).withDefault(ALL).withOptions({ clearOnDefault: true }));
  const [type, setType] = useQueryState("type", parseAsStringLiteral(TYPE_FILTERS).withDefault(ALL).withOptions({ clearOnDefault: true }));
  const [search, setSearch] = useQueryState("q", parseAsString.withDefault("").withOptions({ clearOnDefault: true }));

  const [sort, setSort] = useState<Sort>({ key: "posting_date", dir: "desc" });
  const [shown, setShown] = useState(PAGE);
  const [rowSelection, setRowSelection] = useState<Set<string>>(new Set());
  const [referralOpen, setReferralOpen] = useState(false);

  const { result, query } = useList<Invoice>({
    resource: "Sales Invoice",
    pagination: { mode: "off" },
    sorters: [{ field: "posting_date", order: "desc" }],
    meta: { fields: ["name", "customer", "customer_name", "posting_date", "due_date", "grand_total", "outstanding_amount", "status", "custom_invoice_category", "project"] },
  });

  // Weddings: feed the referral sheet's picker and give each invoice its wedding name.
  const { result: projectsResult } = useList({
    resource: "Project",
    pagination: { mode: "off" },
    meta: { fields: ["name", "project_name", "customer", "expected_end_date"] },
  });

  const invoices = useMemo(() => (result?.data ?? []) as Invoice[], [result]);
  const projects = useMemo(() => (projectsResult?.data ?? []) as WeddingOption[], [projectsResult]);
  const weddingName = useMemo(() => new Map(projects.map((p) => [p.name, p.project_name])), [projects]);

  // Search + type narrow the set; the status chips count within it.
  const deferredSearch = useDeferredValue(search);
  const scoped = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return invoices.filter((i) => {
      if (type !== ALL && i.custom_invoice_category !== type) return false;
      if (!q) return true;
      const wedding = (i.project && weddingName.get(i.project)) || "";
      return [i.name, i.customer_name, wedding].some((v) => v.toLowerCase().includes(q));
    });
  }, [invoices, deferredSearch, type, weddingName]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { [ALL]: scoped.length };
    for (const i of scoped) c[i.status] = (c[i.status] ?? 0) + 1;
    return c;
  }, [scoped]);

  const rows = useMemo(() => {
    const list = scoped.filter((i) => status === ALL || i.status === status);
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = sort.key === "posting_date" ? a.posting_date : a[sort.key];
      const bv = sort.key === "posting_date" ? b.posting_date : b[sort.key];
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  }, [scoped, status, sort]);

  const visible = rows.slice(0, shown);
  // Only invoices on screen can be acted on, so a filter change never leaves hidden rows selected for delete.
  const selectedNames = visible.filter((i) => rowSelection.has(i.name)).map((i) => i.name);
  // The backend reports failures as "name: error"; keep just the names selected.
  const actions = useInvoiceActions(selectedNames, (failed) => setRowSelection(new Set(failed.map((f) => f.split(": ")[0]))));

  function resetShown<T>(setter: (v: T) => unknown) {
    return (v: T) => { setShown(PAGE); void setter(v); };
  }
  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  const toggle = (name: string) =>
    setRowSelection((prev) => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  const toggleAll = (on: boolean) =>
    setRowSelection((prev) => { const n = new Set(prev); visible.forEach((i) => (on ? n.add(i.name) : n.delete(i.name))); return n; });

  useEffect(() => {
    if (query.isError) console.error("Invoices list failed to load", query.error);
  }, [query.isError, query.error]);
  const loadError = query.isError && invoices.length === 0;
  const filtered = search.trim() !== "" || type !== ALL || status !== ALL;
  const busy = actions.assigning || actions.deleting;

  const toRow = (i: Invoice) => ({ invoice: i, wedding: (i.project && weddingName.get(i.project)) || null });

  let body;
  if (loadError) {
    body = (
      <StatePanel
        kind="error"
        title="Couldn't load invoices"
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
        title={filtered ? "No invoices match" : "No invoices yet"}
        text={filtered ? "Try a different search, status or type." : "Invoices appear here once a wedding is billed."}
      />
    );
  } else {
    body = (
      <>
        {isDesktop ? (
          <InvoiceTable rows={visible.map(toRow)} selected={rowSelection} onToggle={toggle} onToggleAll={toggleAll} sort={sort} onSort={onSort} />
        ) : (
          <div className="flex flex-col gap-3">
            {visible.map((i) => <InvoiceCard key={i.name} {...toRow(i)} selected={rowSelection.has(i.name)} onToggle={toggle} />)}
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
        <h1 className="text-2xl font-semibold leading-tight md:font-display md:text-4xl md:leading-10">Invoices</h1>
        <div className="flex items-center gap-2">
          {selectedNames.length > 0 && (
            <>
              <span className="text-sm text-muted-foreground">{selectedNames.length} selected</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={busy} className="max-md:h-12">
                    {actions.assigning ? "Assigning..." : actions.deleting ? "Deleting..." : "Actions"}
                    <ChevronDown className="ml-1.5 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => void actions.assignCategory("Wedding Payment")}>Assign as Wedding Payment</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void actions.assignCategory("Referral Commission")}>Assign as Commission</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void actions.deleteSelected()} className="text-destructive">Delete selected</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
          <Button onClick={() => setReferralOpen(true)} className="max-md:h-12">
            <Plus className="mr-1 h-4 w-4" /> Record referral
          </Button>
        </div>
      </div>

      <ReferralSheet
        open={referralOpen}
        onOpenChange={setReferralOpen}
        projects={projects}
        onRecorded={() => invalidate({ resource: "Sales Invoice", invalidates: ["list"] })}
      />

      {actions.error && (
        <div role="alert" className="flex items-center justify-between rounded-md border border-destructive/30 bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">
          <span>{actions.error}</span>
          <button type="button" onClick={actions.clearError} aria-label="Dismiss" className="ml-4 flex h-8 w-8 items-center justify-center font-medium max-md:h-12 max-md:w-12">&times;</button>
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative md:w-80">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label="Search invoices"
            placeholder="Search invoices"
            value={search}
            onChange={(e) => resetShown(setSearch)(e.target.value)}
            className="rounded-full pl-10 max-md:h-12 max-md:pl-10"
          />
        </div>
        <Select value={type} onValueChange={(v) => resetShown(setType)(v as (typeof TYPE_FILTERS)[number])}>
          <SelectTrigger aria-label="Filter by type" className="rounded-full max-md:h-12 md:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            <SelectItem value="Wedding Payment">Wedding Payment</SelectItem>
            <SelectItem value="Referral Commission">Referral Commission</SelectItem>
          </SelectContent>
        </Select>
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
