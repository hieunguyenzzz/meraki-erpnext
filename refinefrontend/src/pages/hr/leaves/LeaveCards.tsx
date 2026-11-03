import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { LeaveDecision } from "./LeaveDecision";
import { dateRange, statusVariant, type LeaveApp } from "./types";

interface Props {
  apps: LeaveApp[];
  selected: Set<string>;
  processingId: string | null;
  onToggle: (name: string) => void;
  onDecide: (name: string, verb: "approve" | "reject" | "re-approve") => void;
}

/** Phone layout: one card per application with full-width Approve / Reject. */
export function LeaveCards({ apps, selected, processingId, onToggle, onDecide }: Props) {
  return (
    <ul className="flex flex-col gap-2.5">
      {apps.map((a) => (
        <li key={a.name} className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <StaffAvatar name={a.employee_name} id={a.employee} className="h-10 w-10 text-sm" />
            <div className="min-w-0 flex-1">
              <b className="block truncate">{a.employee_name}</b>
              <span className="text-sm text-muted-foreground">{a.leave_type}</span>
            </div>
            <Badge variant={statusVariant(a.status)}>{a.status}</Badge>
            <Checkbox
              className="h-6 w-6"
              checked={selected.has(a.name)}
              onCheckedChange={() => onToggle(a.name)}
              aria-label={`Select ${a.employee_name} ${a.from_date}`}
            />
          </div>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium">{dateRange(a.from_date, a.to_date)}</span>
            <span className="text-muted-foreground">{a.total_leave_days} d{a.half_day ? " (half day)" : ""}</span>
          </div>
          {a.description && <p className="text-sm text-muted-foreground">{a.description}</p>}
          <LeaveDecision app={a} processingId={processingId} onDecide={onDecide} />
        </li>
      ))}
    </ul>
  );
}
