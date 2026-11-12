import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { LeaveDecision } from "./LeaveDecision";
import { dateRange, daysLabel, statusVariant, type LeaveApp } from "./types";

interface Props {
  apps: LeaveApp[];
  selected: Set<string>;
  processingId: string | null;
  onToggle: (name: string) => void;
  onToggleAll: (on: boolean) => void;
  onDecide: (name: string, verb: "approve" | "reject" | "re-approve") => void;
}

/** Desktop layout (D-Leaves.dc.html): employee, type, ISO dates, days, reason, status, actions. */
export function LeaveTable({ apps, selected, processingId, onToggle, onToggleAll, onDecide }: Props) {
  const allOn = apps.length > 0 && apps.every((a) => selected.has(a.name));
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <Table className="min-w-[900px]">
        <TableHeader className="bg-muted/60">
          <TableRow>
            <TableHead className="w-10">
              <Checkbox checked={allOn} onCheckedChange={(v) => onToggleAll(!!v)} aria-label="Select all" />
            </TableHead>
            <TableHead>Employee</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead>Days</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {apps.map((a) => (
            <TableRow key={a.name} className={a.status === "Open" ? "bg-warning-soft/30" : undefined}>
              <TableCell>
                <Checkbox checked={selected.has(a.name)} onCheckedChange={() => onToggle(a.name)} aria-label={`Select ${a.employee_name} ${a.from_date}`} />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2.5">
                  <StaffAvatar name={a.employee_name} id={a.employee} className="h-8 w-8 text-xs" />
                  <b>{a.employee_name}</b>
                </div>
              </TableCell>
              <TableCell><Badge variant="outline">{a.leave_type}</Badge></TableCell>
              <TableCell className="whitespace-nowrap">{dateRange(a.from_date, a.to_date)}</TableCell>
              <TableCell className="whitespace-nowrap">{daysLabel(a)}</TableCell>
              <TableCell className="max-w-[220px] truncate text-muted-foreground" title={a.description || ""}>{a.description || "—"}</TableCell>
              <TableCell><Badge variant={statusVariant(a.status)}>{a.status}</Badge></TableCell>
              <TableCell>
                <div className="ml-auto flex w-[200px] justify-end">
                  <LeaveDecision app={a} processingId={processingId} compact onDecide={onDecide} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
