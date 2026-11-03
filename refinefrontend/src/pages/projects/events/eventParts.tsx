import { Badge } from "@/components/ui/badge";
import { getInitials } from "@/lib/initials";
import { formatTimeRange, type EventStaffRow, type WeddingEvent } from "@/lib/weddingEvents";
import { cn } from "@/lib/utils";

type BadgeVariant = NonNullable<React.ComponentProps<typeof Badge>["variant"]>;

const TYPE_VARIANT: Record<string, BadgeVariant> = {
  "Tea Ceremony": "warning",
  "Pre-wedding Photoshoot": "info",
  "Welcome Dinner": "warning",
  Ceremony: "success",
  "Buddhist Wedding": "success",
  Reception: "default",
  "After Party": "default",
  "Farewell Brunch": "info",
  Other: "secondary",
};

const TONES = [
  "bg-accent text-accent-foreground",
  "bg-success-soft text-success-soft-foreground",
  "bg-warning-soft text-warning-soft-foreground",
  "bg-info-soft text-info-soft-foreground",
];

export function EventTypeBadge({ type }: { type: string }) {
  return <Badge variant={TYPE_VARIANT[type] ?? "secondary"} className="whitespace-nowrap">{type}</Badge>;
}

export const coupleName = (e: WeddingEvent) => e.project_name || e.customer || e.project;

export const eventTime = (e: WeddingEvent) => formatTimeRange(e.start_time, e.end_time) || "--:--";

export function staffName(s: EventStaffRow) {
  return s.employee_name || s.employee;
}

export function staffTitle(s: EventStaffRow) {
  const call = s.call_time ? ` · call ${s.call_time.slice(0, 5)}` : "";
  return `${staffName(s)}${s.role ? ` · ${s.role}` : ""}${call}`;
}

/** Overlapping initials, three at most then "+N"; names stay in the tooltip and screen-reader text. */
export function StaffAvatars({ staff, max = 3 }: { staff: EventStaffRow[]; max?: number }) {
  if (staff.length === 0) return <span className="text-muted-foreground">{"—"}</span>;
  const shown = staff.slice(0, max);
  const extra = staff.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((s, i) => (
        <span
          key={`${s.employee}-${i}`}
          title={staffTitle(s)}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full border-2 border-card text-[10px] font-bold",
            TONES[i % TONES.length],
            i > 0 && "-ml-1.5"
          )}
        >
          <span aria-hidden>{getInitials(staffName(s))}</span>
          <span className="sr-only">{staffTitle(s)}</span>
        </span>
      ))}
      {extra > 0 && (
        <span
          title={staff.slice(max).map(staffName).join(", ")}
          className="-ml-1.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-secondary text-[10px] font-bold"
        >
          +{extra}
        </span>
      )}
    </span>
  );
}

export function venueText(e: WeddingEvent): string {
  return [e.venue_name, e.venue_area].filter(Boolean).join(" · ");
}
