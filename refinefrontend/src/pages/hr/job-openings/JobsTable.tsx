import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { JobActions } from "./JobActions";
import { JobStatusBadge } from "./JobStatusBadge";
import { statusOf, type JobOpening, type Sort, type SortKey } from "./types";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "job_title", label: "Job title" },
  { key: "status", label: "Status" },
  { key: "location", label: "Location" },
  { key: "closes_on", label: "Closing date" },
];

interface Props {
  jobs: JobOpening[];
  sort: Sort | null;
  onSort: (key: SortKey) => void;
  onEdit: (job: JobOpening) => void;
  onToggleStatus: (job: JobOpening) => void;
  /** Applicants per Job Opening name */
  applicantCounts: Map<string, number>;
  /** Opening shown in the edit panel, highlighted */
  activeName: string | null;
}

/** Desktop table (D-Jobs): closed openings are muted, the one being edited is highlighted. */
export function JobsTable({ jobs, sort, onSort, onEdit, onToggleStatus, applicantCounts, activeName }: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] border-collapse text-sm">
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
              <th scope="col" className="whitespace-nowrap px-4 py-3 text-left text-[13px] font-semibold text-muted-foreground">Applicants</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => {
              const closed = statusOf(j) !== "Open";
              return (
                <tr
                  key={j.name}
                  aria-selected={activeName === j.name || undefined}
                  className={cn("border-t", closed && "text-muted-foreground", activeName === j.name && "bg-accent/50 shadow-[inset_3px_0_0_hsl(var(--primary))]")}
                >
                  <td className={cn("whitespace-nowrap px-4 py-3.5 font-bold", closed && "text-foreground/80")}>{j.job_title}</td>
                  <td className="whitespace-nowrap px-4 py-3.5"><JobStatusBadge status={statusOf(j)} /></td>
                  <td className="whitespace-nowrap px-4 py-3.5">{j.location || "-"}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 tabular-nums">{j.closes_on || "-"}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 tabular-nums">{applicantCounts.get(j.name) ?? 0}</td>
                  <td className="whitespace-nowrap px-2 py-1.5"><JobActions pill job={j} onEdit={onEdit} onToggleStatus={onToggleStatus} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
