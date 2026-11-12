import { CheckCircle2, Save } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface Props {
  doneSections: number;
  totalSections: number;
  /** Saved employee record is complete and the form has no unsaved edits. */
  saved: boolean;
}

/** Progress of required sections, or the "Profile complete" state. */
export function CompletionBanner({ doneSections, totalSections, saved }: Props) {
  if (doneSections === totalSections && !saved) {
    return (
      <div role="status" className="flex items-center gap-3 rounded-card bg-accent px-4 py-3 text-primary">
        <Save className="h-5 w-5 flex-none" aria-hidden />
        <div>
          <b className="block text-sm">Ready to save</b>
          <span className="text-xs">All required sections are filled. Save to finish your profile.</span>
        </div>
      </div>
    );
  }
  if (doneSections === totalSections) {
    return (
      <div role="status" className="flex items-center gap-3 rounded-card bg-success-soft px-4 py-3 text-success-soft-foreground">
        <CheckCircle2 className="h-5 w-5 flex-none" aria-hidden />
        <div>
          <b className="block text-sm">Profile complete</b>
          <span className="text-xs">HR has everything needed for payroll. You can update details any time.</span>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-card bg-warning-soft px-4 py-3 text-warning-soft-foreground">
      <div className="flex items-center gap-3">
        <Progress
          value={(doneSections / totalSections) * 100}
          className="flex-1 bg-background/60"
          indicatorClassName="bg-success"
          aria-label="Required sections completed"
        />
        <span className="text-sm font-semibold">{doneSections} of {totalSections}</span>
      </div>
      <p className="text-xs">
        Please complete your profile to get started. All required fields (*) must be filled; the rest of the app unlocks when you finish.
      </p>
    </div>
  );
}
