import { Button } from "@/components/ui/button";
import { CopyLinkButton } from "./CopyLinkButton";
import { statusOf, type JobOpening } from "./types";

interface Props {
  job: JobOpening;
  onEdit: (job: JobOpening) => void;
  onToggleStatus: (job: JobOpening) => void;
}

/** Edit, copy the public application link, close or reopen. */
export function JobActions({ job, onEdit, onToggleStatus }: Props) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" className="max-md:h-12 md:h-9 md:px-3" onClick={() => onEdit(job)}>Edit</Button>
      <CopyLinkButton jobName={job.name} />
      <Button variant="ghost" className="max-md:h-12 md:h-9 md:px-3" onClick={() => onToggleStatus(job)}>
        {statusOf(job) === "Open" ? "Close" : "Reopen"}
      </Button>
    </div>
  );
}
