import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { SectionCard } from "@/components/wedding/SectionCard";
import { getLeaveBalanceVariant } from "@/lib/review-status";
import type { LeaveAllocation, LeaveBalance, LeavePeriod } from "./types";

interface Props {
  balance: LeaveBalance;
  periods: LeavePeriod[];
  loadError: boolean;
  onEdit: (alloc: LeaveAllocation) => void;
}

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl bg-secondary p-3 text-center">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function LeaveBalanceCard({ balance, periods, loadError, onEdit }: Props) {
  const percent = balance.allocated > 0 ? (balance.remaining / balance.allocated) * 100 : 0;
  const tone = percent > 50 ? "bg-success" : percent >= 25 ? "bg-warning" : "bg-destructive";

  return (
    <SectionCard title="Leave balance">
      {loadError ? (
        <p role="alert" className="text-sm text-danger-soft-foreground">Could not load the leave balance. Reload the page to try again.</p>
      ) : balance.allocated > 0 ? (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Annual leave</span>
            <Badge variant={getLeaveBalanceVariant(balance.remaining, balance.allocated)}>
              {balance.remaining}/{balance.allocated} days
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <Tile value={balance.remaining} label="Remaining" />
            <Tile value={balance.taken} label="Used" />
            <Tile value={balance.allocated} label="Allocated" />
          </div>
          <Progress value={percent} className="h-2" indicatorClassName={tone} aria-label="Leave remaining" />
          {balance.accrued < balance.allocated && (
            <p className="text-xs text-muted-foreground">{balance.accrued} of {balance.allocated} days accrued so far</p>
          )}
          {periods.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              {periods.map((period) => (
                <div key={period.label} className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {period.label}{period.is_current ? " (current)" : ""}
                  </p>
                  {period.allocations.map((alloc) => (
                    <div key={alloc.name} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{alloc.leave_type}</span>
                      <span className="flex items-center gap-1">
                        <span className="tabular-nums">{alloc.allocated} days</span>
                        <button
                          type="button"
                          aria-label={`Edit ${alloc.leave_type} allocation for ${period.label}`}
                          onClick={() => onEdit(alloc)}
                          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No leave allocation found</p>
      )}
    </SectionCard>
  );
}
