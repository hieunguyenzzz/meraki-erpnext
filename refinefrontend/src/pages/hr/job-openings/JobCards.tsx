import { JobActions } from "./JobActions";
import { JobStatusBadge } from "./JobStatusBadge";
import { statusOf, type JobOpening } from "./types";

/** Phone list, M-Venues style: one card per opening with its actions underneath. */
export function JobCards({ jobs, onEdit, onToggleStatus }: { jobs: JobOpening[]; onEdit: (job: JobOpening) => void; onToggleStatus: (job: JobOpening) => void }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {jobs.map((j) => (
        <li key={j.name} className="flex flex-col gap-1 rounded-2xl border bg-card p-3 pb-1 text-card-foreground">
          <div className="flex items-start justify-between gap-2">
            <b className="min-w-0 break-words text-base">{j.job_title}</b>
            <JobStatusBadge status={statusOf(j)} />
          </div>
          <span className="text-[13px] text-muted-foreground">
            {[j.location, j.closes_on ? `Closes ${j.closes_on}` : null].filter(Boolean).join(" · ") || "No location or closing date"}
          </span>
          <div className="-ml-2 mt-1 border-t pt-1"><JobActions job={j} onEdit={onEdit} onToggleStatus={onToggleStatus} /></div>
        </li>
      ))}
    </ul>
  );
}
