import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AddRowButton, Field, FormSection } from "./FormSection";
import type { FormData } from "./types";

interface Props {
  form: FormData;
  onChange: (updates: Partial<FormData>) => void;
  /** Name of the existing customer that already uses the typed email, if any. */
  duplicateCustomer: string | null;
}

export function CoupleSection({ form, onChange, duplicateCustomer }: Props) {
  return (
    <FormSection title="Couple">
      <Field label="Couple name" htmlFor="couple-name" required>
        <Input
          id="couple-name"
          placeholder="e.g. John & Jane Smith"
          value={form.coupleName}
          onChange={(e) => onChange({ coupleName: e.target.value })}
        />
      </Field>

      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          type="email"
          placeholder="email@example.com"
          value={form.email}
          onChange={(e) => onChange({ email: e.target.value })}
          aria-invalid={!!duplicateCustomer}
        />
      </Field>
      {duplicateCustomer && (
        <p role="alert" className="-mt-2 text-sm text-destructive">
          This email is already used by <strong>{duplicateCustomer}</strong>. Please use a different email.
        </p>
      )}

      {form.extraEmails.map((email, i) => (
        <Field key={i} label={`Email ${i + 2}`}>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="Additional email"
              aria-label={`Email ${i + 2}`}
              value={email}
              onChange={(e) => {
                const updated = [...form.extraEmails];
                updated[i] = e.target.value;
                onChange({ extraEmails: updated });
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove email ${i + 2}`}
              onClick={() => onChange({ extraEmails: form.extraEmails.filter((_, idx) => idx !== i) })}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </Field>
      ))}
      <AddRowButton label="Add another email" onClick={() => onChange({ extraEmails: [...form.extraEmails, ""] })} />

      <Field label="Phone" htmlFor="phone">
        <Input
          id="phone"
          type="tel"
          placeholder="+84 123 456 789"
          value={form.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
        />
      </Field>
    </FormSection>
  );
}
