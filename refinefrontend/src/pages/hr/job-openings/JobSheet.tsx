import { Briefcase } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { JobForm } from "./JobForm";
import type { JobOpening } from "./types";

/** Phone frame for the job form: a bottom sheet. Desktop uses JobPanel beside the table. */
export function JobSheet({ open, job, onClose }: { open: boolean; job: JobOpening | null; onClose: () => void }) {
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="flex max-h-[92dvh] flex-col p-0">
        <SheetHeader className="border-b px-5 pb-4 pt-5">
          <SheetTitle className="flex items-center gap-2 text-xl">
            <Briefcase className="h-5 w-5" aria-hidden />
            {job ? "Edit job opening" : "Create job opening"}
          </SheetTitle>
        </SheetHeader>
        {open && <JobForm job={job} onClose={onClose} sheet />}
      </SheetContent>
    </Sheet>
  );
}
