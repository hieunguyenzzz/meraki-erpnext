import { Badge } from "@/components/ui/badge";
import { EmployeeStatusBadge } from "@/components/staff/EmployeeStatusBadge";
import type { Employee } from "./types";

/** Status badge; Left shows the relieving date, Active shows a Probation badge beside it. */
export function EmployeeStatusCell({ employee: e }: { employee: Employee }) {
  if (e.status === "Left" && e.relieving_date) {
    return <Badge variant="destructive">Left · {e.relieving_date}</Badge>;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <EmployeeStatusBadge status={e.status} />
      {!!e.custom_is_probation && <Badge variant="warning">Probation</Badge>}
    </span>
  );
}
