import { Badge } from "@/components/ui/badge";
import { ASSIGNABLE_ROLES } from "@/lib/roles";
import type { StaffRow } from "./types";

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

export function RoleBadges({ roles }: { roles: string[] }) {
  const assigned = ASSIGNABLE_ROLES.filter((r) => roles.includes(r.role));
  if (assigned.length === 0) return <span className="text-sm text-muted-foreground">{"—"}</span>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {assigned.map((r) => (
        <Badge key={r.role} variant={r.variant as BadgeVariant}>{r.label}</Badge>
      ))}
    </div>
  );
}

export function StatusBadge({ row }: { row: StaffRow }) {
  return row.is_probation ? <Badge variant="warning">Probation</Badge> : <Badge variant="success">Active</Badge>;
}
