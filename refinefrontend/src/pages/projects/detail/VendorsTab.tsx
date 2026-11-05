import { useEffect, useState } from "react";
import { useInvalidate } from "@refinedev/core";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover as ShadcnPopover, PopoverContent as ShadcnPopoverContent, PopoverTrigger as ShadcnPopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { SectionCard } from "@/components/wedding/SectionCard";
import { formatVNDFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import { VENDOR_CATEGORIES } from "./constants";
import { InlineError } from "./InlineError";
import type { WeddingData } from "./useWeddingData";

/** Vendors booked for the wedding (saved through /inquiry-api/wedding/{name}/vendors). */
export function VendorsTab({ w }: { w: WeddingData }) {
  const { name, project, allSuppliers } = w;
  const invalidate = useInvalidate();
  const [vendors, setVendors] = useState<{category: string; supplier: string; supplierName: string; amount: number; notes: string}[]>([]);
  const [addingVendor, setAddingVendor] = useState(false);
  const [newVendor, setNewVendor] = useState({ category: "", supplier: "", amount: "", notes: "" });
  const [vendorSupplierOpen, setVendorSupplierOpen] = useState(false);
  const [vendorSupplierSearch, setVendorSupplierSearch] = useState("");
  const [isSavingVendors, setIsSavingVendors] = useState(false);
  const [vendorError, setVendorError] = useState<string | null>(null);
  const [isCreatingVendorSupplier, setIsCreatingVendorSupplier] = useState(false);

  // Sync vendors from project data
  useEffect(() => {
    if (project?.custom_wedding_vendors) {
      setVendors(project.custom_wedding_vendors.map((v: any) => ({
        category: v.category,
        supplier: v.supplier,
        supplierName: allSuppliers.find(s => s.name === v.supplier)?.supplier_name || v.supplier,
        amount: v.amount || 0,
        notes: v.notes || "",
      })));
    }
  }, [project?.custom_wedding_vendors, allSuppliers]);

  async function saveVendors(updatedVendors: typeof vendors) {
    setIsSavingVendors(true);
    setVendorError(null);
    try {
      const resp = await fetch(`/inquiry-api/wedding/${name}/vendors`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendors: updatedVendors.map(v => ({
            category: v.category,
            supplier: v.supplier,
            amount: v.amount,
            notes: v.notes,
          })),
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to save vendors");
      }
      invalidate({ resource: "Project", invalidates: ["detail"], id: name });
    } catch (error) {
      setVendorError(error instanceof Error ? error.message : "Failed to save vendors");
    } finally {
      setIsSavingVendors(false);
    }
  }

  function handleAddVendor() {
    if (!newVendor.category || !newVendor.supplier) return;
    const supplierObj = allSuppliers.find(s => s.name === newVendor.supplier);
    const updated = [...vendors, {
      category: newVendor.category,
      supplier: newVendor.supplier,
      supplierName: supplierObj?.supplier_name || newVendor.supplier,
      amount: parseFloat(newVendor.amount) || 0,
      notes: newVendor.notes,
    }];
    setVendors(updated);
    saveVendors(updated);
    setNewVendor({ category: "", supplier: "", amount: "", notes: "" });
    setAddingVendor(false);
    setVendorSupplierSearch("");
  }

  function handleDeleteVendor(index: number) {
    const updated = vendors.filter((_, i) => i !== index);
    setVendors(updated);
    saveVendors(updated);
  }

  async function handleCreateVendorSupplier() {
    if (!vendorSupplierSearch.trim()) return;
    setIsCreatingVendorSupplier(true);
    try {
      const resp = await fetch("/inquiry-api/wedding/vendors/create-supplier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier_name: vendorSupplierSearch.trim() }),
      });
      if (!resp.ok) throw new Error("Failed to create supplier");
      const created = await resp.json();
      // Refresh suppliers list
      invalidate({ resource: "Supplier", invalidates: ["list"] });
      setNewVendor({ ...newVendor, supplier: created.name });
      setVendorSupplierOpen(false);
    } catch (error) {
      setVendorError(error instanceof Error ? error.message : "Failed to create supplier");
    } finally {
      setIsCreatingVendorSupplier(false);
    }
  }

  return (
    <SectionCard
      title="Wedding vendors"
      action={
        <Button size="sm" onClick={() => setAddingVendor(true)} disabled={addingVendor}>
          <Plus className="h-4 w-4" />
          Add Vendor
        </Button>
      }
    >
      <InlineError message={vendorError} />
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">Category</th>
                  <th className="px-3 py-2 text-left font-medium">Vendor</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 text-left font-medium">Notes</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((v, i) => (
                  <tr key={i} className="border-b last:border-b-0">
                    <td className="px-3 py-2">{v.category}</td>
                    <td className="px-3 py-2">{v.supplierName}</td>
                    <td className="px-3 py-2 text-right">{v.amount ? formatVNDFull(v.amount) : "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{v.notes}</td>
                    <td className="px-3 py-2">
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => handleDeleteVendor(i)} disabled={isSavingVendors}>
                        <X className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {addingVendor && (
                  <tr className="border-b last:border-b-0 bg-muted/30">
                    <td className="px-3 py-2">
                      <Select value={newVendor.category}
                        onValueChange={(v) => setNewVendor({ ...newVendor, category: v })}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="Category" /></SelectTrigger>
                        <SelectContent>
                          {VENDOR_CATEGORIES.map(c => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <ShadcnPopover open={vendorSupplierOpen} onOpenChange={setVendorSupplierOpen}>
                        <ShadcnPopoverTrigger asChild>
                          <button type="button"
                            className="w-full flex items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm h-8">
                            <span className={newVendor.supplier ? "" : "text-muted-foreground"}>
                              {newVendor.supplier
                                ? (allSuppliers.find(s => s.name === newVendor.supplier)?.supplier_name ?? newVendor.supplier)
                                : "Select vendor..."}
                            </span>
                            <ChevronsUpDown className="h-3 w-3 opacity-50" />
                          </button>
                        </ShadcnPopoverTrigger>
                        <ShadcnPopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search vendors..." value={vendorSupplierSearch} onValueChange={setVendorSupplierSearch} />
                            <CommandList>
                              <CommandEmpty>
                                <div className="py-2 text-center">
                                  <p className="text-sm text-muted-foreground mb-2">No vendors found</p>
                                  {vendorSupplierSearch.trim() && (
                                    <Button type="button" variant="outline" size="sm"
                                      onClick={handleCreateVendorSupplier} disabled={isCreatingVendorSupplier}>
                                      <Plus className="h-3 w-3 mr-1" />
                                      {isCreatingVendorSupplier ? "Creating..." : `Create "${vendorSupplierSearch.trim()}"`}
                                    </Button>
                                  )}
                                </div>
                              </CommandEmpty>
                              <CommandGroup>
                                {allSuppliers
                                  .filter(s => !vendorSupplierSearch || s.supplier_name.toLowerCase().includes(vendorSupplierSearch.toLowerCase()))
                                  .map(s => (
                                    <CommandItem key={s.name} value={s.supplier_name}
                                      onSelect={() => {
                                        setNewVendor({ ...newVendor, supplier: s.name });
                                        setVendorSupplierOpen(false);
                                      }}>
                                      <Check className={cn("mr-2 h-4 w-4", newVendor.supplier === s.name ? "opacity-100" : "opacity-0")} />
                                      {s.supplier_name}
                                    </CommandItem>
                                  ))}
                              </CommandGroup>
                              {vendorSupplierSearch.trim() && allSuppliers.some(s => s.supplier_name.toLowerCase().includes(vendorSupplierSearch.toLowerCase())) && (
                                <CommandGroup heading="Create new">
                                  <CommandItem value={`__create_${vendorSupplierSearch}`} onSelect={handleCreateVendorSupplier}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Create "{vendorSupplierSearch.trim()}"
                                  </CommandItem>
                                </CommandGroup>
                              )}
                            </CommandList>
                          </Command>
                        </ShadcnPopoverContent>
                      </ShadcnPopover>
                    </td>
                    <td className="px-3 py-2">
                      <Input className="h-8 w-28 text-right" type="number" min="0" step="1" placeholder="Amount"
                        value={newVendor.amount}
                        onChange={e => setNewVendor({ ...newVendor, amount: e.target.value })} />
                    </td>
                    <td className="px-3 py-2">
                      <Input className="h-8" placeholder="Notes (optional)"
                        value={newVendor.notes}
                        onChange={e => setNewVendor({ ...newVendor, notes: e.target.value })} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={handleAddVendor} disabled={!newVendor.category || !newVendor.supplier || isSavingVendors}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => { setAddingVendor(false); setNewVendor({ category: "", supplier: "", amount: "", notes: "" }); setVendorSupplierSearch(""); }}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
                {vendors.length === 0 && !addingVendor && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      No vendors added yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
    </SectionCard>
  );
}
