import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { EmployeeStatusBadge } from "@/components/staff/EmployeeStatusBadge";
import { displayName } from "@/lib/format";
import type { Employee } from "@/lib/types";
import { isoDate, tenureLabel } from "./dates";

interface Props {
  employee: Employee;
  onBack: () => void;
  onSchedule: () => void;
  onStatus: () => void;
  onDelete: () => void;
}

export function EmployeeHeader({ employee, onBack, onSchedule, onStatus, onDelete }: Props) {
  const name = displayName(employee);
  const active = employee.status === "Active";
  const role = [employee.designation, employee.department].filter(Boolean).join(" · ");
  const since = employee.date_of_joining
    ? `joined ${isoDate(employee.date_of_joining)} · ${tenureLabel(employee.date_of_joining)}`
    : "";

  return (
    <header className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div className="flex flex-wrap items-center gap-4">
        <StaffAvatar name={name} id={employee.name} className="h-[72px] w-[72px] text-[22px]" />
        <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1.5">
          <h1 className="break-words font-display text-[32px] font-semibold leading-9 md:text-[38px] md:leading-[42px]">{name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <EmployeeStatusBadge status={employee.status} />
            {!!employee.custom_is_probation && (
              <Badge variant="warning">
                Probation{employee.custom_probation_end_date ? ` · ends ${isoDate(employee.custom_probation_end_date)}` : ""}
              </Badge>
            )}
            {employee.custom_pit_method === "Flat 10%" && <Badge variant="info">Flat 10% PIT</Badge>}
          </div>
          {(role || since) && <p className="text-sm text-muted-foreground">{[role, since].filter(Boolean).join(" · ")}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onSchedule}>Schedule review</Button>
        <Button
          variant="outline"
          className={active ? "border-destructive/30 text-destructive hover:bg-danger-soft" : "border-success/30 text-success-soft-foreground hover:bg-success-soft"}
          onClick={onStatus}
        >
          {active ? "Deactivate" : "Activate"}
        </Button>
        <Button variant="outline" className="border-destructive/30 text-destructive hover:bg-danger-soft" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </header>
  );
}
