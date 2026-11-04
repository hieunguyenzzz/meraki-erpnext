import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyLinkButton } from "./CopyLinkButton";
import { JobForm } from "./JobForm";
import type { JobOpening } from "./types";

/** Desktop edit / create panel that sits beside the table (D-Jobs). `status` is the live status of the opening, so the close/reopen label stays right after a toggle. */
export function JobPanel({ job, status, onClose, onToggleStatus }: { job: JobOpening | null; status: string; onClose: () => void; onToggleStatus: (job: JobOpening) => void }) {
  return (
    <aside aria-label={job ? "Edit job opening" : "Create job opening"} className="flex max-w-[440px] flex-1 basis-[360px] flex-col gap-3.5 rounded-2xl border bg-card p-5 shadow-[0_8px_24px_rgba(42,35,38,.06)]">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[26px] font-semibold leading-tight">{job ? "Edit job opening" : "Create job opening"}</h2>
        <button type="button" aria-label="Close" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-muted hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {job && (
        <div className="-mx-2 -mt-1 flex items-center gap-1">
          <CopyLinkButton jobName={job.name} />
          <Button variant="ghost" className="h-9 px-3" onClick={() => onToggleStatus(job)}>{status === "Open" ? "Close opening" : "Reopen"}</Button>
        </div>
      )}
      <JobForm job={job} onClose={onClose} />
    </aside>
  );
}
