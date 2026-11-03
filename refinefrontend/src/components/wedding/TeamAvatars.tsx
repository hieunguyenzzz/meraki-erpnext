import { getInitials } from "@/lib/initials";
import { cn } from "@/lib/utils";
import { Phone } from "lucide-react";

export interface TeamMember { id: string; name: string; role?: string; phone?: string | null }

const TONES = [
  "bg-accent text-accent-foreground",
  "bg-success-soft text-success-soft-foreground",
  "bg-warning-soft text-warning-soft-foreground",
  "bg-info-soft text-info-soft-foreground",
];

function Avatar({ name, index, className }: { name: string; index: number; className?: string }) {
  return (
    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold", TONES[index % TONES.length], className)}>
      {getInitials(name)}
    </span>
  );
}

/** One row per member: initials, name, role; tap-to-call when a phone number is known. */
export function TeamList({ members }: { members: TeamMember[] }) {
  return (
    <ul className="flex flex-col gap-2.5 text-sm">
      {members.map((m, i) => (
        <li key={m.id} className="flex items-center gap-2.5">
          <Avatar name={m.name} index={i} />
          <span className="min-w-0 flex-1">
            <b className="font-semibold">{m.name}</b>
            {m.role && <span className="text-muted-foreground"> · {m.role}</span>}
          </span>
          {m.phone && (
            <a href={`tel:${m.phone}`} aria-label={`Call ${m.name}`} className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary">
              <Phone className="h-4 w-4" />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
