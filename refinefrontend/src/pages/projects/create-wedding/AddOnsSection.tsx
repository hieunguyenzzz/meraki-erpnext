import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MoneyInput } from "@/components/ui/money-input";
import { AddRowButton, FormSection } from "./FormSection";
import { CreatableCombobox } from "./CreatableCombobox";
import { apiErrorMessage, type AddOnItem, type AddOnRow, type FormData } from "./types";

interface Props {
  form: FormData;
  onChange: (updates: Partial<FormData>) => void;
  items: AddOnItem[];
  /** Reload the add-on item list after a new item was created. */
  onItemsChanged: () => void;
}

let nextRowId = 1;

export function AddOnsSection({ form, onChange, items, onItemsChanged }: Props) {
  const [createError, setCreateError] = useState<string | null>(null);

  const patchRow = (id: number, patch: Partial<AddOnRow>) =>
    onChange({ addOns: form.addOns.map((a) => (a.id === id ? { ...a, ...patch } : a)) });

  async function createItem(row: AddOnRow, name: string): Promise<boolean> {
    setCreateError(null);
    try {
      const resp = await fetch("/inquiry-api/wedding/addon-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ item_name: name.trim() }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(apiErrorMessage(body, "Failed to create add-on"));
      }
      const item = await resp.json();
      patchRow(row.id, { itemCode: item.name ?? name, itemName: item.item_name ?? name });
      onItemsChanged();
      return true;
    } catch (err) {
      console.error("Create add-on failed", err);
      setCreateError(err instanceof Error ? err.message : "Failed to create add-on");
      return false;
    }
  }

  return (
    <FormSection title="Add-ons">
      {form.addOns.map((row, i) => (
        <div key={row.id} className="flex flex-col gap-3 rounded-card border p-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <CreatableCombobox
                options={items.map((it) => ({ value: it.name, label: it.item_name }))}
                value={row.itemCode}
                valueLabel={row.itemName}
                placeholder="Choose or create add-on..."
                searchPlaceholder="Search add-ons..."
                emptyText="No add-ons yet. Type to create."
                onSelect={(o) => {
                  const item = items.find((it) => it.name === o.value);
                  patchRow(row.id, {
                    itemCode: o.value,
                    itemName: o.label,
                    includeInCommission: item ? item.custom_include_in_commission === 1 : row.includeInCommission,
                  });
                }}
                onCreate={(name) => createItem(row, name)}
                onSearchChange={() => setCreateError(null)}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              aria-label={`Remove add-on ${i + 1}`}
              onClick={() => onChange({ addOns: form.addOns.filter((a) => a.id !== row.id) })}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <MoneyInput
            aria-label={`Add-on ${i + 1} price (VND)`}
            placeholder="Price (VND)"
            value={row.price}
            onChange={(price) => patchRow(row.id, { price })}
          />
          <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm">
            <Checkbox
              checked={row.includeInCommission}
              onCheckedChange={(v) => patchRow(row.id, { includeInCommission: v === true })}
              className="h-5 w-5"
            />
            Include in commission
          </label>
        </div>
      ))}
      {createError && <p role="alert" className="text-xs text-destructive">{createError}</p>}
      <AddRowButton
        label="Add add-on"
        onClick={() =>
          onChange({
            addOns: [...form.addOns, { id: nextRowId++, itemCode: "", itemName: "", price: "", includeInCommission: false }],
          })
        }
      />
    </FormSection>
  );
}
