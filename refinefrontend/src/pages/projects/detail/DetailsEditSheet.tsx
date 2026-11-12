import { useEffect, useState } from "react";
import { useInvalidate, useUpdate } from "@refinedev/core";
import { Check, ChevronsUpDown, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { AddOnsEditor } from "./AddOnsEditor";
import { Popover as ShadcnPopover, PopoverContent as ShadcnPopoverContent, PopoverTrigger as ShadcnPopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { InlineError } from "./InlineError";
import type { AddOnCatalogItem, WeddingData } from "./useWeddingData";

interface Props {
  w: WeddingData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Edit panel for date, venue, package, tax and add-ons (saved through /inquiry-api/wedding/{name}/details). */
export function DetailsEditSheet({ w, open, onOpenChange }: Props) {
  const { name, project, salesOrder, soItems, venues, availableAddOns, fetchAddonItems, fetchSOItems, isFinance } = w;
  const invalidate = useInvalidate();
  const { mutateAsync: updateRecord } = useUpdate();
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editVenueOpen, setEditVenueOpen] = useState(false);
  const [editVenueSearch, setEditVenueSearch] = useState("");
  const [editVenueDisplayName, setEditVenueDisplayName] = useState("");
  const [editForm, setEditForm] = useState({
    weddingDate: "",
    venue: "",
    packageAmount: "",
    totalBudget: "",
    addOns: [] as { itemCode: string; itemName: string; qty: number; rate: number; includeInCommission: boolean }[],
    taxType: "tax_free" as "tax_free" | "vat_included",
    serviceType: "" as string,
    weddingType: "" as string,
  });
  const [populateCount, setPopulateCount] = useState(0);

  // Each time the panel opens: refresh the add-on catalogue, then fill the form from the current record.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setEditError(null);
    fetchAddonItems().then((fresh) => { if (!cancelled) populateDetailsForm(fresh); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function populateDetailsForm(addOnsLookup: AddOnCatalogItem[]) {
    if (!project) return;
    const lookupCodes = new Set(addOnsLookup.map((a) => a.name));
    const currentAddOns = soItems
      .filter((i) => lookupCodes.has(i.item_code))
      .map((i) => {
        const itemMeta = addOnsLookup.find((a) => a.name === i.item_code);
        return { itemCode: i.item_code, itemName: i.item_name, qty: i.qty, rate: i.rate, includeInCommission: !!itemMeta?.custom_include_in_commission };
      });
    // Package item = any SO row whose code is NOT in the add-on catalog
    const planningItem = soItems.find((i) => !lookupCodes.has(i.item_code));
    setEditForm((prev) => ({
      ...prev,
      weddingDate: project?.expected_end_date || "",
      venue: salesOrder?.custom_venue || "",
      packageAmount: planningItem ? String(planningItem.rate) : "",
      totalBudget: project?.custom_total_budget ? String(project.custom_total_budget) : "",
      addOns: currentAddOns,
      taxType: ((salesOrder as any)?.taxes?.length > 0) ? "vat_included" : "tax_free",
      serviceType: project?.custom_service_type || "",
      weddingType: project?.custom_wedding_type || "",
    }));
    setPopulateCount((c) => c + 1);
    const v = venues.find((v) => v.name === salesOrder?.custom_venue);
    setEditVenueDisplayName(v?.supplier_name || salesOrder?.custom_venue || "");
  }

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmittingEdit(true);
    setEditError(null);
    try {
      const resp = await fetch(`/inquiry-api/wedding/${name}/details`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          venue: editForm.venue || null,
          wedding_date: editForm.weddingDate || null,
          package_amount: editForm.packageAmount ? parseFloat(editForm.packageAmount) : null,
          tax_type: editForm.taxType === "vat_included" ? "vat" : "none",
          service_type: editForm.serviceType || null,
          wedding_type: editForm.weddingType || null,
          addons: editForm.addOns.map((a) => ({
            item_code: a.itemCode,
            item_name: a.itemName,
            qty: a.qty,
            rate: a.rate,
            include_in_commission: a.includeInCommission,
          })),
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        const detail = err.detail;
        const msg = Array.isArray(detail)
          ? detail.map((d: any) => d.msg || JSON.stringify(d)).join(", ")
          : detail || "Failed to save details";
        throw new Error(msg);
      }
      // Save total budget on Project if changed
      const budgetVal = editForm.totalBudget ? parseFloat(editForm.totalBudget) : 0;
      if (budgetVal !== (project?.custom_total_budget || 0)) {
        await updateRecord({
          resource: "Project",
          id: name!,
          values: { custom_total_budget: budgetVal },
        });
      }
      invalidate({ resource: "Project", invalidates: ["detail"], id: name });
      invalidate({ resource: "Sales Order", invalidates: ["detail"], id: project?.sales_order! });
      const updatedProject = await fetch(`/api/resource/Project/${name}`, { credentials: "include" }).then(r => r.json());
      const newSOName = updatedProject?.data?.sales_order;
      if (newSOName) fetchSOItems(newSOName);
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
        <SheetTitle>Edit Wedding Details</SheetTitle>
      </SheetHeader>
      <form onSubmit={handleSaveDetails} className="flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          <InlineError message={editError} />
  
          {/* Wedding Date */}
          <div className="space-y-2">
            <Label>Wedding Date</Label>
            <Input
              type="date"
              value={editForm.weddingDate}
              onChange={(e) => setEditForm({ ...editForm, weddingDate: e.target.value })}
            />
          </div>
  
          {/* Venue */}
          <div className="space-y-2">
            <Label>Venue</Label>
            <ShadcnPopover open={editVenueOpen} onOpenChange={setEditVenueOpen}>
              <ShadcnPopoverTrigger asChild>
                <button
                  type="button"
                  role="combobox"
                  className="w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors border-input bg-background hover:border-primary/50 focus:outline-none"
                >
                  {editVenueDisplayName || editForm.venue || <span className="text-muted-foreground">Select venue...</span>}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </button>
              </ShadcnPopoverTrigger>
              <ShadcnPopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Search venues..."
                    value={editVenueSearch}
                    onValueChange={setEditVenueSearch}
                  />
                  <CommandList>
                    <CommandEmpty>No venues found.</CommandEmpty>
                    <CommandGroup>
                      {venues.map((v) => (
                        <CommandItem
                          key={v.name}
                          value={v.supplier_name}
                          onSelect={() => {
                            setEditForm({ ...editForm, venue: v.name });
                            setEditVenueDisplayName(v.supplier_name);
                            setEditVenueOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", editForm.venue === v.name ? "opacity-100" : "opacity-0")} />
                          {v.supplier_name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </ShadcnPopoverContent>
            </ShadcnPopover>
          </div>
  
          {/* Service Type */}
          <div className="space-y-2">
            <Label>Service Type</Label>
            <div className="flex gap-3">
              {["Full Package", "Partial", "Coordinator"].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setEditForm({ ...editForm, serviceType: editForm.serviceType === opt ? "" : opt })}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-md border text-sm font-medium transition-all",
                    editForm.serviceType === opt
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
  
          {/* Wedding Type */}
          <div className="space-y-2">
            <Label>Wedding Type</Label>
            <div className="flex gap-3">
              {["HCM", "Destination"].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setEditForm({ ...editForm, weddingType: editForm.weddingType === opt ? "" : opt })}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-md border text-sm font-medium transition-all",
                    editForm.weddingType === opt
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
  
          {/* Package Amount — finance only */}
          {isFinance && (
          <div className="space-y-2">
            <Label htmlFor="edit-package-amount">Package Amount (VND)</Label>
            <Input
              id="edit-package-amount"
              type="number"
              min="0"
              step="1"
              placeholder="e.g. 150000000"
              value={editForm.packageAmount}
              onChange={(e) => setEditForm({ ...editForm, packageAmount: e.target.value })}
            />
          </div>
          )}
  
          {/* Total Wedding Budget — finance only */}
          {isFinance && (
          <div className="space-y-2">
            <Label htmlFor="edit-total-budget">Total Wedding Budget (VND)</Label>
            <Input
              id="edit-total-budget"
              type="number"
              min="0"
              step="1"
              placeholder="e.g. 500000000"
              value={editForm.totalBudget}
              onChange={(e) => setEditForm({ ...editForm, totalBudget: e.target.value })}
            />
          </div>
          )}
  
          {/* Tax Type */}
          <div className="space-y-2">
            <Label>Tax</Label>
            <div className="flex gap-3">
              {[
                { value: "tax_free" as const, label: "Tax Free" },
                { value: "vat_included" as const, label: "VAT Included (8%)" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setEditForm({ ...editForm, taxType: opt.value })}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-md border text-sm font-medium transition-all",
                    editForm.taxType === opt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
  
          <AddOnsEditor key={populateCount} addOns={editForm.addOns} onChange={(addOns) => setEditForm((prev) => ({ ...prev, addOns }))} availableAddOns={availableAddOns} isFinance={isFinance} refreshCatalogue={fetchAddonItems} onError={setEditError} />
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
