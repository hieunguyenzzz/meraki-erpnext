import { useEffect, useMemo, useState } from "react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { RotateCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatePanel } from "@/pages/projects/weddings-list/StatePanel";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { LeaveCards } from "./LeaveCards";
import { LeaveTable } from "./LeaveTable";
import { STATUS_FILTERS, type LeaveApp, type StatusFilter } from "./types";

interface Props {
  apps: LeaveApp[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  processingId: string | null;
  isDeleting: boolean;
  onDecide: (name: string, verb: "approve" | "reject" | "re-approve") => void;
  onDelete: (names: string[]) => Promise<boolean>;
}

const PAGE_SIZE = 50;
const ANY_TYPE = "__any__";
const opts = { clearOnDefault: true } as const;

export function ApplicationsTab({ apps, isLoading, isError, refetch, processingId, isDeleting, onDecide, onDelete }: Props) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [status, setStatus] = useQueryState("status", parseAsStringLiteral(STATUS_FILTERS).withDefault("Open").withOptions(opts));
  const [typeParam, setType] = useQueryState("type", { defaultValue: "", clearOnDefault: true });
  const [search, setSearch] = useQueryState("q", { defaultValue: "", clearOnDefault: true });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const types = useMemo(() => Array.from(new Set(apps.map((a) => a.leave_type))).sort(), [apps]);
  // A type in the URL that no application has falls back to "any"
  const type = types.includes(typeParam) ? typeParam : "";

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { Open: 0, Approved: 0, Rejected: 0, All: apps.length };
    for (const a of apps) if (a.status === "Open" || a.status === "Approved" || a.status === "Rejected") c[a.status] += 1;
    return c;
  }, [apps]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return apps.filter((a) =>
      (status === "All" || a.status === status) &&
      (!type || a.leave_type === type) &&
      (!q || a.employee_name.toLowerCase().includes(q)),
    );
  }, [apps, status, type, search]);
  const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit]);

  useEffect(() => setLimit(PAGE_SIZE), [status, type, search]);

  // Only records on screen can be selected, so a hidden row is never deleted by mistake
  const selectedApps = useMemo(() => filtered.filter((a) => selected.has(a.name)), [filtered, selected]);
  const approvedInSelection = selectedApps.filter((a) => a.docstatus === 1).length;

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }
  function toggleAll(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const a of visible) { if (on) next.add(a.name); else next.delete(a.name); }
      return next;
    });
  }
  async function confirmDelete() {
    const ok = await onDelete(selectedApps.map((a) => a.name));
    if (ok) setSelected(new Set());
    setConfirmOpen(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <div role="group" aria-label="Status" className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:rounded-full md:bg-muted md:p-[3px] md:px-[3px]">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
              className={cn(
                "h-10 shrink-0 rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-[34px] md:border-0",
                status === s
                  ? "border-foreground bg-foreground text-background md:bg-card md:text-foreground md:shadow-sm"
                  : "border-border bg-card text-foreground hover:bg-muted md:bg-transparent",
              )}
            >
              {s} · {counts[s]}
            </button>
          ))}
        </div>
        <Select value={type || ANY_TYPE} onValueChange={(v) => setType(v === ANY_TYPE ? "" : v)}>
          <SelectTrigger aria-label="Leave type" className="h-12 rounded-full md:h-10 md:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_TYPE}>Type: Any</SelectItem>
            {types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="relative flex md:ml-auto md:w-60">
          <span className="sr-only">Search employee</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee"
            className="h-12 rounded-full pl-10 max-md:pl-10 md:h-10"
          />
        </label>
      </div>

      {selectedApps.length > 0 && (
        <div role="region" aria-label="Selected leave records" className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/30 bg-danger-soft px-4 py-2.5 text-danger-soft-foreground">
          <span className="flex-1 text-sm">
            {selectedApps.length} record{selectedApps.length > 1 ? "s" : ""} selected
            {approvedInSelection > 0 && <b> · {approvedInSelection} approved (will reverse leave balance)</b>}
          </span>
          <Button size="sm" variant="destructive" onClick={() => setConfirmOpen(true)}>Delete {selectedApps.length} selected</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-2.5" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[120px] rounded-2xl md:h-14" />)}
        </div>
      ) : isError ? (
        <StatePanel kind="error" title="Could not load leave applications" text="Check your connection and try again." action={{ label: "Retry", onClick: refetch, icon: <RotateCw className="h-4 w-4" /> }} />
      ) : filtered.length === 0 ? (
        <StatePanel kind="empty" title="No leave applications" text={apps.length === 0 ? "Nothing has been applied for yet." : "No applications match these filters."} />
      ) : isDesktop ? (
        <LeaveTable apps={visible} selected={selected} processingId={processingId} onToggle={toggle} onToggleAll={toggleAll} onDecide={onDecide} />
      ) : (
        <LeaveCards apps={visible} selected={selected} processingId={processingId} onToggle={toggle} onDecide={onDecide} />
      )}

      {filtered.length > visible.length && (
        <Button variant="outline" className="self-center" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
          Show more ({filtered.length - visible.length})
        </Button>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedApps.length} leave record{selectedApps.length > 1 ? "s" : ""}?</DialogTitle>
            <DialogDescription>
              This action cannot be undone.
              {approvedInSelection > 0 && (
                <span className="mt-2 block font-medium text-warning-soft-foreground">
                  {approvedInSelection} approved leave{approvedInSelection > 1 ? "s" : ""} will be cancelled and deleted. The balance will be restored.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting}>{isDeleting ? "Deleting..." : "Delete"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
