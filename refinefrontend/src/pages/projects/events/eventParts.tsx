import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

function AvatarChip({ label, className, children }: { label: string; className: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          // Touch has no hover: a tap toggles the tooltip.
          onClick={(e) => {
            e.preventDefault();
            setOpen((o) => !o);
          }}
          className={cn("flex h-7 w-7 items-center justify-center rounded-full border-2 border-card text-[10px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Overlapping initials, three at most then "+N"; each opens a tooltip with name, role and call time (hover, focus or tap). */
export function StaffAvatars({ staff, max = 3 }: { staff: EventStaffRow[]; max?: number }) {
  if (staff.length === 0) return <span className="text-muted-foreground">{"—"}</span>;
  const shown = staff.slice(0, max);
  const rest = staff.slice(max);
  return (
    <span className="flex items-center">
      {shown.map((s, i) => (
        <AvatarChip key={`${s.employee}-${i}`} label={staffTitle(s)} className={cn(TONES[i % TONES.length], i > 0 && "-ml-1.5")}>
          {getInitials(staffName(s))}
        </AvatarChip>
      ))}
      {rest.length > 0 && (
        <AvatarChip label={rest.map(staffTitle).join("; ")} className="-ml-1.5 bg-secondary">
          +{rest.length}
        </AvatarChip>
      )}
    </span>
  );
}

export function venueText(e: WeddingEvent): string {
  return [e.venue_name, e.venue_area].filter(Boolean).join(" · ");
}
