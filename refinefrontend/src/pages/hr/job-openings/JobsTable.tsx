import { ArrowDown, ArrowUp } from "lucide-react";
import { JobActions } from "./JobActions";
import { JobStatusBadge } from "./JobStatusBadge";
import { statusOf, type JobOpening, type Sort, type SortKey } from "./types";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "job_title", label: "Job title" },
  { key: "status", label: "Status" },
  { key: "location", label: "Location" },
  { key: "closes_on", label: "Closes on" },
];

interface Props {
  jobs: JobOpening[];
  sort: Sort | null;
  onSort: (key: SortKey) => void;
  onEdit: (job: JobOpening) => void;
  onToggleStatus: (job: JobOpening) => void;
}

/** Desktop table, D-Staff style. */
export function JobsTable({ jobs, sort, onSort, onEdit, onToggleStatus }: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="bg-muted/60">
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} scope="col" aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className="whitespace-nowrap px-4 py-3 text-left text-[13px] font-semibold text-muted-foreground">
                  <button type="button" onClick={() => onSort(c.key)} className="inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {c.label}
                    {sort?.key === c.key && (sort.dir === 1 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                  </button>
                </th>
              ))}
              <th scope="col" className="whitespace-nowrap px-4 py-3 text-left text-[13px] font-semibold text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.name} className="border-t">
                <td className="whitespace-nowrap px-4 py-3 font-semibold">{j.job_title}</td>
                <td className="whitespace-nowrap px-4 py-3"><JobStatusBadge status={statusOf(j)} /></td>
                <td className="whitespace-nowrap px-4 py-3">{j.location || "-"}</td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">{j.closes_on || "-"}</td>
                <td className="whitespace-nowrap px-2 py-1.5"><JobActions job={j} onEdit={onEdit} onToggleStatus={onToggleStatus} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
