import { useEffect, useState } from "react";
import { useInvalidate, useUpdate } from "@refinedev/core";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { InlineError } from "./InlineError";
import type { WeddingData } from "./useWeddingData";

interface Props {
  w: WeddingData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Edit panel for who sold the wedding and the booking date. */
export function SalesEditSheet({ w, open, onOpenChange }: Props) {
  const { name, project, employees } = w;
  const invalidate = useInvalidate();
  const { mutateAsync: updateRecord } = useUpdate();
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [salesForm, setSalesForm] = useState({ salesPerson: "", bookingDate: "" });

  useEffect(() => {
    if (!open) return;
    setSalesForm({ salesPerson: project?.custom_sales_person || "", bookingDate: project?.custom_booking_date || "" });
    setEditError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSaveSales(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmittingEdit(true);
    setEditError(null);
    try {
      await updateRecord({
        resource: "Project",
        id: name,
        values: {
          custom_sales_person: salesForm.salesPerson || null,
          custom_booking_date: salesForm.bookingDate || null,
        },
      });
      invalidate({ resource: "Project", invalidates: ["detail"], id: name });
      onOpenChange(false);
    } catch (err: any) {
      setEditError(err?.message || "Failed to save changes");
    } finally {
      setIsSubmittingEdit(false);
    }
  }

  return (
  <Sheet open={open} onOpenChange={(next) => { if (!isSubmittingEdit) { onOpenChange(next); setEditError(null); } }}>
    <SheetContent side="right" className="sm:max-w-lg flex flex-col p-0">
      <SheetHeader className="px-6 py-4 border-b shrink-0">
        <SheetTitle>Edit Sales Information</SheetTitle>
      </SheetHeader>
      <form onSubmit={handleSaveSales} className="flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <InlineError message={editError} />
          <div className="space-y-2">
            <Label>Sold by</Label>
            <Select value={salesForm.salesPerson || "__none__"} onValueChange={(v) => setSalesForm({ ...salesForm, salesPerson: v === "__none__" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Booking Date</Label>
            <Input type="date" value={salesForm.bookingDate} onChange={(e) => setSalesForm({ ...salesForm, bookingDate: e.target.value })} />
          </div>
        </div>
        <SheetFooter className="px-6 py-4 border-t shrink-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmittingEdit}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmittingEdit}>
            {isSubmittingEdit ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
            ) : (
              "Save Changes"
            )}
          </Button>
        </SheetFooter>
      </form>
    </SheetContent>
  </Sheet>
  );
}
