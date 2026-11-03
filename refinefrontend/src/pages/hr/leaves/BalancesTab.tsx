import { useMemo } from "react";
import { RotateCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { StatePanel } from "@/pages/projects/weddings-list/StatePanel";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { formatPeriod, poolOf, type BalanceRow, type useLeaveBalances } from "./useLeaveBalances";

type Balances = ReturnType<typeof useLeaveBalances>;

function PoolBadge({ row }: { row: BalanceRow }) {
  const pool = poolOf(row.fromDate, row.toDate);
  if (!pool) return null;
  return <Badge variant={pool === "Annual" ? "secondary" : "outline"} className="text-xs">{pool}</Badge>;
}

function AllocationInput({ row, b }: { row: BalanceRow; b: Balances }) {
  return (
    <Input
      type="number" min={0} step={0.5}
      aria-label={`Allocated days, ${row.employeeName} ${row.leaveType}`}
      className="ml-auto h-12 w-full text-right md:h-10 md:w-20"
      value={b.values(row).allocated ?? 0}
      onChange={(e) => b.setAllocated(row.allocName!, e.target.value)}
      disabled={b.savingId === row.allocName}
    />
  );
}

function SaveButton({ row, b }: { row: BalanceRow; b: Balances }) {
  if (!row.allocName || !b.isEdited(row.allocName)) return null;
  const saving = b.savingId === row.allocName;
  return (
    <Button size="sm" onClick={() => b.save(row.allocName!, row.taken)} disabled={saving}>
      {saving ? "Saving..." : "Save"}
    </Button>
  );
}

function BalanceTable({ rows, b }: { rows: BalanceRow[]; b: Balances }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <Table className="min-w-[860px]">
        <TableHeader className="bg-muted/60">
          <TableRow>
            <TableHead>Employee</TableHead><TableHead>Leave type</TableHead><TableHead>Period</TableHead>
            <TableHead className="text-right">Allocated</TableHead><TableHead className="text-right">Taken</TableHead>
            <TableHead className="text-right">Remaining</TableHead><TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const has = !!row.allocName;
            return (
              <TableRow key={row.allocName ?? row.employeeId} className={has ? undefined : "text-muted-foreground"}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <StaffAvatar name={row.employeeName} id={row.employeeId} className="h-8 w-8 text-xs" />
                    <b>{row.employeeName}</b>
                  </div>
                </TableCell>
                <TableCell>{row.leaveType ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{formatPeriod(row.fromDate, row.toDate)}</span>
                    <PoolBadge row={row} />
                  </div>
                </TableCell>
                <TableCell className="text-right">{has ? <AllocationInput row={row} b={b} /> : "—"}</TableCell>
                <TableCell className="text-right">{has ? row.taken : "—"}</TableCell>
                <TableCell className="text-right">{has ? b.values(row).remaining : "—"}</TableCell>
                <TableCell><SaveButton row={row} b={b} /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function BalanceCards({ rows, b }: { rows: BalanceRow[]; b: Balances }) {
  // One card per employee, one block per allocation
  const groups = useMemo(() => {
    const m = new Map<string, BalanceRow[]>();
    for (const r of rows) m.set(r.employeeId, [...(m.get(r.employeeId) ?? []), r]);
    return Array.from(m.values());
  }, [rows]);
  return (
    <ul className="flex flex-col gap-2.5">
      {groups.map((g) => (
        <li key={g[0].employeeId} className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <StaffAvatar name={g[0].employeeName} id={g[0].employeeId} className="h-10 w-10 text-sm" />
            <b className="flex-1 truncate">{g[0].employeeName}</b>
          </div>
          {g.map((row) =>
            row.allocName ? (
              <div key={row.allocName} className="flex flex-col gap-2 border-t pt-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{row.leaveType}</span>
                  <PoolBadge row={row} />
                  <span className="text-muted-foreground">{formatPeriod(row.fromDate, row.toDate)}</span>
                </div>
                <div className="grid grid-cols-3 items-end gap-2 text-sm">
                  <label className="flex flex-col gap-1 text-muted-foreground">Allocated<AllocationInput row={row} b={b} /></label>
                  <div className="flex flex-col gap-1 text-muted-foreground">Taken<b className="text-base text-foreground">{row.taken}</b></div>
                  <div className="flex flex-col gap-1 text-muted-foreground">Remaining<b className="text-base text-foreground">{b.values(row).remaining}</b></div>
                </div>
                {b.isEdited(row.allocName) && <SaveButton row={row} b={b} />}
              </div>
            ) : (
              <p key="none" className="border-t pt-3 text-sm text-muted-foreground">No allocation</p>
            ),
          )}
        </li>
      ))}
    </ul>
  );
}

export function BalancesTab({ b }: { b: Balances }) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  if (b.isLoading) {
    return (
      <div className="flex flex-col gap-2.5" aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[140px] rounded-2xl md:h-14" />)}
      </div>
    );
  }
  if (b.isError) {
    return <StatePanel kind="error" title="Could not load leave balances" text="Check your connection and try again." action={{ label: "Retry", onClick: b.refetch, icon: <RotateCw className="h-4 w-4" /> }} />;
  }
  if (b.employees.length === 0) {
    return <StatePanel kind="empty" title="No active employees" text="Leave balances appear once there are active employees." />;
  }
  return (
    <div className="flex flex-col gap-3">
      {b.error && <p role="alert" className="rounded-xl border border-destructive/30 bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">{b.error}</p>}
      <p className="text-sm text-muted-foreground">{b.employees.length} active employees</p>
      {isDesktop ? <BalanceTable rows={b.rows} b={b} /> : <BalanceCards rows={b.rows} b={b} />}
    </div>
  );
}
