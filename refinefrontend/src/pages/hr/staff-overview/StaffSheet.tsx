import { useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  /** Ask before closing when true (unsaved changes). */
  dirty?: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Footer buttons; pass a function to get the guarded close (asks before discarding when dirty) for Cancel. */
  footer: ReactNode | ((requestClose: () => void) => ReactNode);
  wide?: boolean;
  children: ReactNode;
}

/** Side sheet on desktop, bottom sheet on phones, with the discard-changes confirmation. */
export function StaffSheet({ open, dirty, onClose, title, subtitle, footer, wide, children }: Props) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [confirming, setConfirming] = useState(false);

  function requestClose() {
    if (dirty) setConfirming(true);
    else onClose();
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => { if (!o) requestClose(); }}>
        <SheetContent
          side={isDesktop ? "right" : "bottom"}
          className={cn("flex flex-col p-0", isDesktop ? (wide ? "sm:max-w-lg" : "sm:max-w-md") : "max-h-[90dvh]")}
        >
          <SheetHeader className="shrink-0 border-b px-6 py-4 pr-14">
            <SheetTitle>{title}</SheetTitle>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">{children}</div>
          <SheetFooter className="shrink-0 gap-2 border-t px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{typeof footer === "function" ? footer(requestClose) : footer}</SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Discard changes?</DialogTitle>
            <DialogDescription>You have unsaved changes. If you leave now they will be lost.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>Keep editing</Button>
            <Button variant="destructive" onClick={() => { setConfirming(false); onClose(); }}>Discard</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
