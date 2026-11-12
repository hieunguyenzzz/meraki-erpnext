import { RotateCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatePanel } from "@/components/StatePanel";
import { yearVN } from "@/lib/businessTime";
import type { LeaveBalance } from "./types";

interface Props {
  balances: LeaveBalance[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/** Desktop balances (D-MeLeave): every figure comes from /leave/balance via useMyLeaveBalances; nothing is worked out here beyond summing the two pools. */
export function LeaveBalanceTable({ balances, isLoading, isError, refetch }: Props) {
  return (
    <section aria-label="Leave balance" className="overflow-hidden rounded-card border bg-card">
      <h2 className="px-4 pb-1 pt-3.5 text-[17px] font-semibold">Balances · {yearVN()}</h2>
      {isLoading ? (
        <div className="p-4" aria-busy="true"><Skeleton className="h-16 rounded-card" /></div>
      ) : isError ? (
        <StatePanel kind="error" title="Could not load your balance" text="Check your connection and try again." action={{ label: "Retry", onClick: refetch, icon: <RotateCw className="h-4 w-4" /> }} />
      ) : balances.length === 0 ? (
        <p className="px-4 pb-4 pt-2 text-sm text-muted-foreground">No leave allocations found. Contact HR if you believe this is an error.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm tabular-nums">
            <thead className="text-left text-[13px] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Leave type</th>
                <th className="px-4 py-3 text-right font-semibold">Available</th>
                <th className="px-4 py-3 text-right font-semibold">This year</th>
                <th className="px-4 py-3 text-right font-semibold">Carry-over</th>
                <th className="px-4 py-3 text-right font-semibold">Taken</th>
                <th className="px-4 py-3 text-right font-semibold">Pending</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => {
                const pending = b.oldPending + b.newPending;
                return (
                  <tr key={b.leaveType} className="border-t">
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">{b.leaveType}</td>
                    <td className="px-4 py-3 text-right text-base font-bold text-success-soft-foreground">{b.totalBalance}</td>
                    <td className="px-4 py-3 text-right">
                      {b.newAllocDays}
                      {b.newAccrued < b.newAllocDays && <span className="ml-1.5 text-[11px] text-muted-foreground">{b.newAccrued} accrued</span>}
                    </td>
                    <td className="px-4 py-3 text-right">{b.showOldPeriod ? b.oldAllocDays : 0}</td>
                    <td className="px-4 py-3 text-right">{b.oldTaken + b.newTaken}</td>
                    <td className={`px-4 py-3 text-right ${pending > 0 ? "font-semibold text-warning-soft-foreground" : ""}`}>{pending}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
