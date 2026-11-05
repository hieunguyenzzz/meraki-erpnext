import { useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { AddOnCatalogItem } from "./useWeddingData";

export interface AddOnRow { itemCode: string; itemName: string; qty: number; rate: number; includeInCommission: boolean }

interface Props {
  addOns: AddOnRow[];
  onChange: (next: AddOnRow[]) => void;
  availableAddOns: AddOnCatalogItem[];
  isFinance: boolean;
  refreshCatalogue: () => void;
  onError: (message: string) => void;
}

/** Add-on rows of the details form: type-ahead from the catalogue, create-on-the-fly, rate and (Finance) commission flag. Mount with a fresh `key` whenever the form is re-populated. */
export function AddOnsEditor({ addOns, onChange, availableAddOns, isFinance, refreshCatalogue, onError }: Props) {
  const [editAddonSearch, setEditAddonSearch] = useState<string[]>(() => addOns.map((a) => a.itemName));
  const [editAddonDropdownOpen, setEditAddonDropdownOpen] = useState<boolean[]>(() => addOns.map(() => false));
  const [isCreatingAddon, setIsCreatingAddon] = useState(false);

  async function handleCreateEditAddon(rowIndex: number, addonName: string, includeInCommission: boolean) {
    if (!addonName.trim()) return;
    setIsCreatingAddon(true);
    try {
      const resp = await fetch("/inquiry-api/wedding/addon-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ item_name: addonName.trim() }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        const detail = err.detail;
        const msg = Array.isArray(detail)
          ? detail.map((d: any) => d.msg || JSON.stringify(d)).join(", ")
          : detail || "Failed to create add-on";
        throw new Error(msg);
      }
      const item = await resp.json();
      const itemCode = item.name ?? addonName;
      const itemName = item.item_name ?? addonName;
      onChange(addOns.map((a, i) => (i === rowIndex ? { ...a, itemCode, itemName, includeInCommission } : a)));
      const newSearch = [...editAddonSearch];
      newSearch[rowIndex] = itemName;
      setEditAddonSearch(newSearch);
      const newOpen = [...editAddonDropdownOpen];
      newOpen[rowIndex] = false;
      setEditAddonDropdownOpen(newOpen);
      // Refresh addon list so the new item appears in future dropdowns
      refreshCatalogue();
    } catch (err: any) {
      onError(err?.message || "Failed to create add-on");
    } finally {
      setIsCreatingAddon(false);
    }
  }

  return (
          <div className="space-y-2">
            <Label>Add-ons</Label>
            {addOns.map((addon, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Add-on name..."
                    value={editAddonSearch[i] ?? addon.itemName}
                    onChange={(e) => {
                      const newSearch = [...editAddonSearch];
                      newSearch[i] = e.target.value;
                      setEditAddonSearch(newSearch);
                      const updated = addOns.map((a, j) =>
                        j === i ? { ...a, itemCode: "", itemName: e.target.value } : a
                      );
                      onChange(updated);
                    }}
                    onFocus={() => {
                      const newOpen = [...editAddonDropdownOpen];
                      newOpen[i] = true;
                      setEditAddonDropdownOpen(newOpen);
                    }}
                    onBlur={() => {
                      setTimeout(() => {
                        const newOpen = [...editAddonDropdownOpen];
                        newOpen[i] = false;
                        setEditAddonDropdownOpen(newOpen);
                      }, 200);
                    }}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  {editAddonDropdownOpen[i] && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {availableAddOns
                        .filter((item) => !editAddonSearch[i] || item.item_name.toLowerCase().includes((editAddonSearch[i] ?? "").toLowerCase()))
                        .map((item) => (
                          <div
                            key={item.name}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              const newSearch = [...editAddonSearch];
                              newSearch[i] = item.item_name;
                              setEditAddonSearch(newSearch);
                              const updated = addOns.map((a, j) =>
                                j === i ? {
                                  ...a,
                                  itemCode: item.name,
                                  itemName: item.item_name,
                                  includeInCommission: !!(item as any).custom_include_in_commission,
                                } : a
                              );
                              onChange(updated);
                              const newOpen = [...editAddonDropdownOpen];
                              newOpen[i] = false;
                              setEditAddonDropdownOpen(newOpen);
                            }}
                            className="px-3 py-2 text-sm cursor-pointer hover:bg-muted flex items-center gap-2"
                          >
                            {item.name === addon.itemCode && <Check className="h-3 w-3" />}
                            {item.item_name}
                          </div>
                        ))}
                      {(editAddonSearch[i] ?? "").length > 0 &&
                        !availableAddOns.some((item) => item.item_name.toLowerCase() === (editAddonSearch[i] ?? "").toLowerCase()) && (
                        <div
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleCreateEditAddon(i, editAddonSearch[i] ?? "", addon.includeInCommission);
                          }}
                          className="px-3 py-2 text-sm cursor-pointer hover:bg-muted flex items-center gap-2 text-[#C4A962]"
                        >
                          {isCreatingAddon ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Plus className="h-3 w-3" />
                          )}
                          Create "{editAddonSearch[i]}"
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <input
                  type="number"
                  placeholder="Rate (VND)"
                  value={addon.rate || ""}
                  onChange={(e) => {
                    const updated = addOns.map((a, j) =>
                      j === i ? { ...a, rate: parseFloat(e.target.value) || 0 } : a
                    );
                    onChange(updated);
                  }}
                  className="w-28 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
                {isFinance && (
                <label className="flex items-center gap-1.5 py-2 text-sm text-muted-foreground whitespace-nowrap cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addon.includeInCommission}
                    onChange={(e) => {
                      const updated = addOns.map((a, j) =>
                        j === i ? { ...a, includeInCommission: e.target.checked } : a
                      );
                      onChange(updated);
                    }}
                    className="accent-[#C4A962]"
                  />
                  Commission
                </label>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => {
                    onChange(addOns.filter((_, j) => j !== i));
                    setEditAddonSearch((prev) => prev.filter((_, j) => j !== i));
                    setEditAddonDropdownOpen((prev) => prev.filter((_, j) => j !== i));
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                onChange([...addOns, { itemCode: "", itemName: "", qty: 1, rate: 0, includeInCommission: false }]);
                setEditAddonSearch((prev) => [...prev, ""]);
                setEditAddonDropdownOpen((prev) => [...prev, false]);
              }}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors pt-1"
            >
              <Plus className="h-4 w-4" />
              Add item
            </button>
          </div>
  );
}
