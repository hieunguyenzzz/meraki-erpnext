import { useQueryState, parseAsStringLiteral } from "nuqs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SectionCard } from "@/components/wedding/SectionCard";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { isoDate } from "./dates";
import type { EmployeeRecord } from "./types";

const FILTERS = ["all", "leave", "wfh"] as const;
const FILTER_LABEL = { all: "All", leave: "Leave", wfh: "WFH" } as const;

interface Props {
  records: EmployeeRecord[];
  processingId: string | null;
  error: string | null;
  onApprove: (r: EmployeeRecord) => void;
  onReject: (r: EmployeeRecord) => void;
}

function statusVariant(status: string) {
  return status === "Approved" ? "success" : status === "Rejected" ? "destructive" : status === "Pending" ? "warning" : "secondary";
}

function Actions({ rec, busy, onApprove, onReject }: { rec: EmployeeRecord; busy: boolean; onApprove: () => void; onReject: () => void }) {
  if (!rec.isPending) return null;
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" disabled={busy} onClick={onApprove}>Approve</Button>
      <Button size="sm" variant="destructive" disabled={busy} onClick={onReject}>Reject</Button>
    </div>
  );
}

export function RecordsTab({ records, processingId, error, onApprove, onReject }: Props) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [filter, setFilter] = useQueryState("records", parseAsStringLiteral(FILTERS).withDefault("all").withOptions({ clearOnDefault: true }));
  const shown = filter === "all" ? records : records.filter((r) => r.type === filter);

  return (
    <SectionCard title="Leave & WFH history">
      {error && <p role="alert" className="text-sm text-danger-soft-foreground">{error}</p>}
      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {FILTER_LABEL[f]}
          </Button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No records found</p>
      ) : isDesktop ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Days</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((rec) => (
              <TableRow key={`${rec.type}-${rec.id}`}>
                <TableCell><Badge variant={rec.type === "leave" ? "secondary" : "outline"}>{rec.type === "leave" ? "Leave" : "WFH"}</Badge></TableCell>
                <TableCell className="tabular-nums">{isoDate(rec.from_date)}</TableCell>
                <TableCell className="tabular-nums">{isoDate(rec.to_date)}</TableCell>
                <TableCell className="tabular-nums">{rec.days}</TableCell>
                <TableCell className="max-w-[200px] truncate">{rec.details}</TableCell>
                <TableCell><Badge variant={statusVariant(rec.status)}>{rec.status}</Badge></TableCell>
                <TableCell>
                  <Actions rec={rec} busy={processingId === rec.id} onApprove={() => onApprove(rec)} onReject={() => onReject(rec)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <ul className="divide-y">
          {shown.map((rec) => (
            <li key={`${rec.type}-${rec.id}`} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Badge variant={rec.type === "leave" ? "secondary" : "outline"}>{rec.type === "leave" ? "Leave" : "WFH"}</Badge>
                  <span className="tabular-nums">{isoDate(rec.from_date)}{rec.to_date !== rec.from_date && ` → ${isoDate(rec.to_date)}`}</span>
                </span>
                <Badge variant={statusVariant(rec.status)}>{rec.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{rec.days} {rec.days === 1 ? "day" : "days"} · {rec.details}</p>
              <Actions rec={rec} busy={processingId === rec.id} onApprove={() => onApprove(rec)} onReject={() => onReject(rec)} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
