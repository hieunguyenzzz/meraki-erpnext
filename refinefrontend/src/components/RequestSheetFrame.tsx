import type { FormEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onSubmit: (e: FormEvent) => void;
  isSubmitting: boolean;
  submitLabel: string;
  error: string | null;
  success: string | null;
  children: ReactNode;
}

/** Request form chrome: full-screen on phones (M-Requests), side sheet on desktop, submit pinned at the bottom. */
export function RequestSheetFrame({ open, onOpenChange, title, onSubmit, isSubmitting, submitLabel, error, success, children }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex flex-col gap-0 p-0 max-md:w-full max-md:max-w-none max-md:rounded-none sm:max-w-md"
      >
        <SheetHeader className="shrink-0 border-b py-4 pl-5 pr-16">
          <SheetTitle className="text-xl">{title}</SheetTitle>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
            {error && (
              <div role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">{error}</div>
            )}
            {success && (
              <div role="status" className="rounded-xl bg-success-soft px-4 py-3 text-sm text-success-soft-foreground">{success}</div>
            )}
            {children}
          </div>

          <SheetFooter className="shrink-0 gap-2 border-t px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            <Button type="button" variant="outline" className="max-md:hidden" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" className="max-md:h-[52px] max-md:text-base" disabled={isSubmitting}>
              {submitLabel}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
