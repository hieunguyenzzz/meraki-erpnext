import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/initials";

const TINTS = [
  "bg-accent text-accent-foreground",
  "bg-info-soft text-info-soft-foreground",
  "bg-success-soft text-success-soft-foreground",
  "bg-warning-soft text-warning-soft-foreground",
  "bg-secondary text-secondary-foreground",
];

function tintFor(key: string): string {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

/** Initials circle with a tint that is stable per employee id. */
export function StaffAvatar({ name, id, className }: { name: string; id: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-xs font-bold", tintFor(id), className)}
    >
      {getInitials(name) || "?"}
    </span>
  );
}
