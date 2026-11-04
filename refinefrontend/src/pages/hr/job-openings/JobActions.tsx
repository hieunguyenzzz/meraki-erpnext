import { Button } from "@/components/ui/button";
import { CopyLinkButton } from "./CopyLinkButton";
import { statusOf, type JobOpening } from "./types";

interface Props {
  job: JobOpening;
  onEdit: (job: JobOpening) => void;
  onToggleStatus: (job: JobOpening) => void;
  /** Desktop table (D-Jobs): only the Edit pill; link and close/reopen live in the edit panel */
  pill?: boolean;
}

/** Edit, copy the public application link, close or reopen. */
export function JobActions({ job, onEdit, onToggleStatus, pill }: Props) {
  if (pill) {
    return <Button variant="secondary" className="h-[34px] bg-muted px-3 text-[13px] text-foreground hover:bg-muted/70" onClick={() => onEdit(job)}>Edit</Button>;
  }
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
