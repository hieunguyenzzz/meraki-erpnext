import { X } from "lucide-react";
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
  /** Extra reason to block Submit (e.g. half the request already went through). */
  submitDisabled?: boolean;
  /** Desktop (D-MeLeave / D-MeWFH): a card beside the history instead of a side sheet. */
  inline?: boolean;
  children: ReactNode;
}

/** Request form chrome: full-screen on phones (M-Requests), inline card on desktop (D-MeLeave), submit pinned at the bottom of phone sheets. */
export function RequestSheetFrame({ open, onOpenChange, title, onSubmit, isSubmitting, submitLabel, error, success, submitDisabled, inline, children }: Props) {
  if (inline) {
    if (!open) return null;
    return (
      <aside aria-label={title} className="flex w-full flex-col gap-3.5 rounded-card border bg-card p-5 shadow-sm lg:max-w-[420px] lg:flex-[1_1_340px]">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[26px] font-semibold leading-tight">{title}</h2>
          <button type="button" aria-label="Close" onClick={() => onOpenChange(false)} className="flex h-10 w-10 items-center justify-center rounded-full bg-muted hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
          {error && <div role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">{error}</div>}
          {success && <div role="status" className="rounded-xl bg-success-soft px-4 py-3 text-sm text-success-soft-foreground">{success}</div>}
          {children}
          <Button type="submit" className="h-12" disabled={isSubmitting || !!success || submitDisabled}>
            {submitLabel}
          </Button>
        </form>
      </aside>
    );
  }
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
            <Button type="submit" className="max-md:h-[52px] max-md:text-base" disabled={isSubmitting || !!success || submitDisabled}>
              {submitLabel}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
