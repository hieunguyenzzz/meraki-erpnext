import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { VendorFormFields } from "./VendorFormFields";
import type { VendorFormValue } from "@/lib/vendor";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  idPrefix: string;
  value: VendorFormValue;
  onChange: (v: VendorFormValue) => void;
  error: string | null;
  busy: boolean;
  submitLabel: string;
  busyLabel: string;
  onSubmit: () => void;
}

/** Slide-over used by both Add vendor (list) and Edit vendor (detail). */
export function VendorFormSheet(p: Props) {
  return (
    <Sheet open={p.open} onOpenChange={p.onOpenChange}>
      <SheetContent className="flex flex-col p-0 sm:max-w-lg">
        <SheetHeader className="border-b px-6 pb-4 pt-6">
          <SheetTitle>{p.title}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {p.error && (
            <div role="alert" className="flex gap-2 rounded-xl border border-destructive/20 bg-danger-soft p-3 text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="text-sm">{p.error}</span>
            </div>
          )}
          <VendorFormFields idPrefix={p.idPrefix} value={p.value} onChange={p.onChange} />
        </div>
        <SheetFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => p.onOpenChange(false)} disabled={p.busy}>Cancel</Button>
          <Button onClick={p.onSubmit} disabled={p.busy}>{p.busy ? p.busyLabel : p.submitLabel}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
