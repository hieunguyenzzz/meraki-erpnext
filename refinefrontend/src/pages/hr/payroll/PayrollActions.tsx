import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PayrollActionsProps {
  hasEntry: boolean;
  canGenerate: boolean;
  canSubmit: boolean;
  canExport: boolean;
  isRunning: boolean;
  submitting: boolean;
  exporting: boolean;
  bonusSaving: boolean;
  onGenerate: () => void;
  onSubmit: () => void;
  onExport: () => void;
}

/** Export PDF, Generate / Recalculate and Submit All; the buttons only open a confirm step (except export). */
export function PayrollActions(p: PayrollActionsProps & { mobile?: boolean }) {
  const size = p.mobile ? "max-md:h-12" : "";
  return (
    <>
      <Button
        variant="outline"
        className={cn(size, p.mobile && "w-12 px-0")}
        aria-label="Export PDF"
        title="Export PDF"
        onClick={p.onExport}
        disabled={!p.canExport || p.exporting}
      >
        <FileDown className="h-4 w-4" aria-hidden />
        {!p.mobile && <span className="ml-2">{p.exporting ? "Đang xuất..." : "Xuất PDF"}</span>}
      </Button>
      {p.canGenerate && (
        <Button variant="outline" className={cn(size, p.mobile && "flex-1")} onClick={p.onGenerate} disabled={p.isRunning || p.submitting || p.bonusSaving}>
          {p.isRunning ? "Generating..." : p.hasEntry ? "Recalculate" : "Generate"}
        </Button>
      )}
      {p.canSubmit && (
        <Button className={cn(size, p.mobile && "flex-1")} onClick={p.onSubmit} disabled={p.submitting || p.isRunning || p.bonusSaving}>
          {p.submitting ? "Submitting..." : "Submit All"}
        </Button>
      )}
    </>
  );
}
