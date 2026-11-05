import { Link } from "react-router";
import { ClipboardCheck, ShieldCheck, UserRound } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { displayName } from "@/lib/format";
import type { StaffRow } from "./types";

interface Props {
  row: StaffRow | null;
  canManageRoles: boolean;
  canReview: boolean;
  onClose: () => void;
  onReview: (row: StaffRow) => void;
  onRoles: (row: StaffRow) => void;
}

const item = "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-base font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Phone row actions as a bottom sheet. */
export function StaffActionsSheet({ row, canManageRoles, canReview, onClose, onReview, onRoles }: Props) {
  return (
    <Sheet open={row !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <SheetHeader className="pb-2 pr-12">
          <SheetTitle>{row ? displayName(row) : ""}</SheetTitle>
        </SheetHeader>
        {row && (
          <div className="flex flex-col">
            <Link to={`/hr/employees/${row.name}`} className={item}><UserRound className="h-5 w-5" />View profile</Link>
            {canReview && (
              <button type="button" className={item} onClick={() => { onClose(); onReview(row); }}>
                <ClipboardCheck className="h-5 w-5" />Review
              </button>
            )}
            {canManageRoles && (
              <button type="button" className={item} onClick={() => { onClose(); onRoles(row); }}>
                <ShieldCheck className="h-5 w-5" />Assign roles
              </button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
