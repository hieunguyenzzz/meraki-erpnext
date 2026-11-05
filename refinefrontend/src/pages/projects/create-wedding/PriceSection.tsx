import { MoneyInput } from "@/components/ui/money-input";
import { formatVND } from "@/lib/format";
import { ChoiceGroup, Field, FormSection } from "./FormSection";
import type { FormData } from "./types";

interface Props {
  form: FormData;
  onChange: (updates: Partial<FormData>) => void;
  commissionBase: number;
}

export function PriceSection({ form, onChange, commissionBase }: Props) {
  const showBase = form.addOns.length > 0 && !!form.packageAmount;
  return (
    <FormSection title="Price & tax">
      <Field label="Package amount (VND)" htmlFor="package-amount">
        <MoneyInput
          id="package-amount"
          placeholder="50.000.000"
          value={form.packageAmount}
          onChange={(packageAmount) => onChange({ packageAmount })}
        />
      </Field>
      <Field label="Tax">
        <ChoiceGroup
          label="Tax"
          value={form.taxType}
          options={[
            { value: "tax_free", label: "Tax free" },
            { value: "vat_included", label: "VAT included (8%)" },
          ]}
          onChange={(taxType) => onChange({ taxType })}
        />
      </Field>
      {showBase && (
        <div className="flex items-center justify-between gap-3 border-t pt-3 text-sm">
          <span className="text-muted-foreground">Commission base</span>
          <b className="tabular-nums">{formatVND(commissionBase)}</b>
        </div>
      )}
    </FormSection>
  );
}
