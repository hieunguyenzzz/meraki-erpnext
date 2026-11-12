import { Input } from "@/components/ui/input";
import { ChoiceGroup, Field, FormSection } from "./FormSection";
import type { FormData } from "./types";

interface Props {
  form: FormData;
  onChange: (updates: Partial<FormData>) => void;
}

export function WeddingSection({ form, onChange }: Props) {
  return (
    <FormSection title="Wedding">
      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
        <Field label="Wedding date" htmlFor="wedding-date" required>
          <Input
            id="wedding-date"
            type="date"
            value={form.weddingDate}
            onChange={(e) => onChange({ weddingDate: e.target.value })}
          />
        </Field>
        <Field label="Guest count" htmlFor="guest-count">
          <Input
            id="guest-count"
            type="number"
            inputMode="numeric"
            placeholder="100"
            value={form.guestCount}
            onChange={(e) => onChange({ guestCount: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Wedding type" required>
        <ChoiceGroup
          label="Wedding type"
          value={form.weddingType}
          options={[
            { value: "HCM", label: "HCM" },
            { value: "Destination", label: "Destination" },
          ]}
          onChange={(weddingType) => onChange({ weddingType })}
        />
      </Field>
    </FormSection>
  );
}
