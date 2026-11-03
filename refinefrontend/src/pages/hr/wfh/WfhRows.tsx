import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ApprovalActions } from "@/components/notifications/ApprovalActions";
import type { Outcome } from "@/hooks/useNotificationActions";
import { getInitials } from "@/lib/initials";
import { STATUS_LABEL, STATUS_VARIANT, calcDays, dateRange, statusOf, type WfhRequest } from "./types";

export interface RowProps {
  request: WfhRequest;
  outcome?: Outcome;
  processing: boolean;
  error?: string;
  onDecide: (name: string, action: "approve" | "reject") => void;
}

export function Person({ request }: { request: WfhRequest }) {
  const name = request.employee_name || request.employee;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="h-10 w-10">
        <AvatarFallback className="bg-accent text-[13px] font-bold text-accent-foreground">{getInitials(name)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 truncate font-semibold">{name}</span>
    </div>
  );
}

export function StatusBadge({ request, outcome }: { request: WfhRequest; outcome?: Outcome }) {
  const status = statusOf(request, outcome);
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}

function Days({ request }: { request: WfhRequest }) {
  const n = calcDays(request.from_date, request.to_date);
  return <>{n} day{n === 1 ? "" : "s"}</>;
}

/** Desktop table row (D-WFH.dc.html). */
export function WfhTableRow({ request, outcome, processing, error, onDecide }: RowProps) {
  const pending = request.docstatus === 0;
  return (
    <tr className="border-t align-middle">
      <td className="px-4 py-3"><Person request={request} /></td>
      <td className="whitespace-nowrap px-4 py-3 tabular-nums">{dateRange(request.from_date, request.to_date)}</td>
      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{calcDays(request.from_date, request.to_date)}</td>
      <td className="max-w-[260px] truncate px-4 py-3 text-muted-foreground" title={request.explanation || undefined}>
        {request.explanation || "—"}
      </td>
      <td className="px-4 py-3"><StatusBadge request={request} outcome={outcome} /></td>
      <td className="px-4 py-3">
        {pending && (
          <div className="w-48">
            <ApprovalActions compact outcome={outcome} processing={processing} onDecide={(a) => onDecide(request.name, a)} />
            {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
          </div>
        )}
      </td>
    </tr>
  );
}

/** Phone card: 48px Approve / Reject under the request. */
export function WfhCard({ request, outcome, processing, error, onDecide }: RowProps) {
  const pending = request.docstatus === 0;
  return (
    <article className="flex flex-col gap-3 rounded-card border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1"><Person request={request} /></div>
        <StatusBadge request={request} outcome={outcome} />
      </div>
      <div className="text-[15px]">
        <b className="tabular-nums">{dateRange(request.from_date, request.to_date)}</b>
        <span className="text-muted-foreground"> · <Days request={request} /></span>
      </div>
      {request.explanation && (
        <p className="rounded-xl bg-muted px-3 py-2.5 text-sm text-foreground/80">{request.explanation}</p>
      )}
      {pending && (
        <>
          <ApprovalActions outcome={outcome} processing={processing} onDecide={(a) => onDecide(request.name, a)} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </>
      )}
    </article>
  );
}
