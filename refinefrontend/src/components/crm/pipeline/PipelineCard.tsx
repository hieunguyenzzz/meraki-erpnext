import { Link } from "react-router";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  formatAge, getColumnForItem, getDocName, hoursElapsed, type KanbanItem,
} from "@/lib/kanban";

/** Waiting tone: the longer a lead waits, the louder (gold after 24 h, red after 48 h). */
function waitingTone(waitingFor: "client" | "staff", hours: number): string {
  if (hours >= 48) return "bg-danger-soft text-danger-soft-foreground";
  if (hours >= 24) return "bg-warning-soft text-warning-soft-foreground";
  if (waitingFor === "client") return "bg-info-soft text-info-soft-foreground";
  return "bg-muted text-muted-foreground";
}

function Awaiting({ item }: { item: KanbanItem }) {
  const timestamp = item.lastActivity?.date ?? item.creation;
  const waiting = item.lastActivity?.waitingFor ?? "staff";
  return (
    <span className={cn("self-start rounded-full px-2 py-0.5 text-xs font-semibold", waitingTone(waiting, hoursElapsed(timestamp)))}>
      {waiting === "client" ? "Awaiting client" : "Awaiting staff"}
    </span>
  );
}

/** One lead on the board or in the phone list: couple, date and budget, source and age. */
export function PipelineCard({ item }: { item: KanbanItem }) {
  const stage = getColumnForItem(item);
  const to = item.doctype === "Lead" ? `/crm/leads/${getDocName(item)}` : `/crm/opportunities/${getDocName(item)}`;
  const facts = [item.weddingDate ?? "Date TBC", item.budget].filter(Boolean).join(" · ");
  const age = formatAge(item.lastActivity?.date ?? item.creation);
  const showAwaiting = stage === "new" || stage === "engaged" || stage === "meeting" || stage === "quoted";

  return (
    <Link
      to={to}
      className="flex min-h-12 shrink-0 flex-col gap-1.5 rounded-card border bg-card p-3.5 text-card-foreground shadow-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:rounded-xl md:border-transparent md:px-3.5 md:py-3"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 break-words text-base font-semibold md:text-[15px]">{item.displayName}</span>
        {item.doctype === "Opportunity" && <Badge variant="warning" className="shrink-0 px-1.5 py-0 text-[10px]">Opp</Badge>}
      </div>
      <span className="text-[13px] text-muted-foreground">{facts}</span>
      {item.meetingDate && (
        <span className="flex items-center gap-1 text-xs font-semibold text-info-soft-foreground">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          Meeting {item.meetingDate.slice(0, 10)} {item.meetingDate.slice(11, 16)}
        </span>
      )}
      {showAwaiting && <Awaiting item={item} />}
      <span className="text-xs text-muted-foreground">
        {[item.source, `Last activity ${age}`].filter(Boolean).join(" · ")}
      </span>
    </Link>
  );
}
