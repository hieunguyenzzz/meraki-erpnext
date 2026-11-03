import { RotateCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatePanel } from "@/components/StatePanel";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { yearVN } from "@/lib/businessTime";
import type { LeaveBalance } from "./types";

interface Props {
  balances: LeaveBalance[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

function Row({ label, value, tone, indent }: { label: string; value: string | number; tone?: "warn" | "faint"; indent?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${indent ? "text-xs" : "text-[13px]"} ${tone === "warn" ? "text-warning-soft-foreground" : tone === "faint" ? "opacity-60" : ""}`}>
      <span className={indent ? "pl-2" : ""}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/** Full breakdown: last year's carry-over pool, then this year's allocation pool. */
function Breakdown({ b }: { b: LeaveBalance }) {
  const year = yearVN();
  return (
    <div className="flex flex-col gap-3 text-muted-foreground">
      {b.showOldPeriod && (
        <div className="flex flex-col gap-0.5 border-t pt-3">
          <Row label={`${year - 1} carry-over`} value={`${b.oldBalance} / ${b.oldAllocDays} days`} />
          {b.oldTaken > 0 && <Row indent label="taken" value={b.oldTaken} />}
          {b.oldPending > 0 && <Row indent tone="warn" label="pending" value={b.oldPending} />}
        </div>
      )}
      <div className="flex flex-col gap-0.5 border-t pt-3">
        <Row label={`${year} allocation`} value={`${b.newBalance} / ${b.newAccrued} days`} />
        <Row indent tone="faint" label={`of ${b.newAllocDays} annual`} value="" />
        {b.newTaken > 0 && <Row indent label="taken" value={b.newTaken} />}
        {b.newPending > 0 && <Row indent tone="warn" label="pending" value={b.newPending} />}
      </div>
    </div>
  );
}

function BalanceCard({ b, desktop }: { b: LeaveBalance; desktop: boolean }) {
  const year = yearVN();
  const sub = b.showOldPeriod ? `${b.oldBalance} carried over · ${b.newBalance} this year` : `${b.newBalance} this year`;
  return (
    <li className="rounded-card border bg-card p-4">
      <div className="text-sm text-muted-foreground">{b.leaveType}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums">{b.totalBalance}</span>
        <span className="text-sm text-muted-foreground">days available</span>
      </div>
      <div className="text-xs text-muted-foreground">{sub}</div>
      {desktop ? (
        <div className="mt-3"><Breakdown b={b} /></div>
      ) : (
        <details className="group mt-1">
          <summary className="-mx-1 flex min-h-11 cursor-pointer list-none items-center px-1 text-sm font-semibold text-primary [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Show {year} breakdown</span>
            <span className="hidden group-open:inline">Hide breakdown</span>
          </summary>
          <Breakdown b={b} />
        </details>
      )}
    </li>
  );
}

/** Balance cards per leave type (M-Requests: cards on top; D-Me: left column on desktop). */
export function LeaveBalanceCards({ balances, isLoading, isError, refetch }: Props) {
  const desktop = useMediaQuery("(min-width: 768px)");

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-28 rounded-card" />
        <Skeleton className="h-28 rounded-card" />
      </div>
    );
  }
  if (isError) {
    return (
      <StatePanel kind="error" title="Could not load your balance" text="Check your connection and try again." action={{ label: "Retry", onClick: refetch, icon: <RotateCw className="h-4 w-4" /> }} />
    );
  }
  if (balances.length === 0) {
    return (
      <div className="rounded-card border bg-card p-4 text-center text-sm text-muted-foreground">
        No leave allocations found. Contact HR if you believe this is an error.
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-3">
      {balances.map((b) => <BalanceCard key={b.leaveType} b={b} desktop={desktop} />)}
    </ul>
  );
}
