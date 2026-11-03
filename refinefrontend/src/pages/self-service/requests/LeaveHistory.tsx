import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { todayVN } from "@/lib/businessTime";
import { dateRange, leaveStatusVariant, STATUS_LABEL, type LeaveApplication } from "./types";

interface Props {
  apps: LeaveApplication[];
  desktop: boolean;
  cancellingId: string | null;
  onCancel: (name: string) => void;
}

function isCancellable(a: LeaveApplication) {
  return a.docstatus !== 2 && a.status !== "Rejected" && a.from_date >= todayVN();
}

function StatusBadge({ status }: { status: string }) {
  return <Badge variant={leaveStatusVariant(status)}>{STATUS_LABEL[status] ?? status}</Badge>;
}

function CancelButton({ a, cancellingId, onCancel, className }: { a: LeaveApplication; cancellingId: string | null; onCancel: (n: string) => void; className?: string }) {
  if (!isCancellable(a)) return null;
  return (
    <Button
      type="button"
      variant="outline"
      className={`border-destructive/40 text-destructive hover:bg-danger-soft hover:text-destructive ${className ?? ""}`}
      disabled={cancellingId !== null}
      aria-label={`Cancel ${a.leave_type} ${a.from_date}`}
      onClick={() => onCancel(a.name)}
    >
      <X aria-hidden />
      {cancellingId === a.name ? "Cancelling…" : "Cancel"}
    </Button>
  );
}

/** Desktop table, same style as the HR leave table. */
function LeaveHistoryTable({ apps, cancellingId, onCancel }: Omit<Props, "desktop">) {
  return (
    <div className="overflow-x-auto rounded-card border bg-card">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead className="bg-muted text-left text-[13px] text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-semibold">Type</th>
            <th className="px-4 py-3 font-semibold">Dates</th>
            <th className="px-4 py-3 text-right font-semibold">Days</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">Reason</th>
            <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {apps.map((a) => (
            <tr key={a.name} className="border-t align-middle">
              <td className="whitespace-nowrap px-4 py-3 font-semibold">{a.leave_type}</td>
              <td className="whitespace-nowrap px-4 py-3 tabular-nums">{dateRange(a.from_date, a.to_date)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{a.total_leave_days}</td>
              <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
              <td className="max-w-[220px] truncate px-4 py-3 text-muted-foreground" title={a.description || undefined}>{a.description || "—"}</td>
              <td className="px-4 py-2 text-right"><CancelButton a={a} cancellingId={cancellingId} onCancel={onCancel} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Phone card: type, dates, status, and a 48px Cancel for future requests. */
function LeaveHistoryCards({ apps, cancellingId, onCancel }: Omit<Props, "desktop">) {
  return (
    <ul className="flex flex-col gap-2.5">
      {apps.map((a) => (
        <li key={a.name} className="flex flex-col gap-2.5 rounded-card border bg-card p-4">
          <div className="flex items-center gap-3">
            <b className="min-w-0 flex-1 truncate">{a.leave_type}</b>
            <StatusBadge status={a.status} />
          </div>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium tabular-nums">{dateRange(a.from_date, a.to_date)}</span>
            <span className="text-muted-foreground">{a.total_leave_days} d</span>
          </div>
          {a.description && <p className="text-sm text-muted-foreground">{a.description}</p>}
          <CancelButton a={a} cancellingId={cancellingId} onCancel={onCancel} className="w-full" />
        </li>
      ))}
    </ul>
  );
}

export function LeaveHistory({ desktop, ...rest }: Props) {
  return desktop ? <LeaveHistoryTable {...rest} /> : <LeaveHistoryCards {...rest} />;
}
