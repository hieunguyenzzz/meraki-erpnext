import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { FormData, SetField } from "./profileForm";

interface Props {
  id: keyof FormData;
  label: string;
  form: FormData;
  setField: SetField;
  type?: string;
  placeholder?: string;
  inputMode?: "tel" | "email" | "numeric";
  required?: boolean;
  showErrors?: boolean;
  className?: string;
}

export function Field({ id, label, form, setField, type, placeholder, inputMode, className, required, showErrors }: Props) {
  const invalid = !!required && !!showErrors && !form[id]?.trim();
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        required={required}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        className={invalid ? "border-destructive focus-visible:ring-destructive" : undefined}
        placeholder={placeholder}
        value={form[id]}
        onChange={(e) => setField(id, e.target.value)}
      />
    </div>
  );
}

export function ReadOnlyRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="text-sm text-muted-foreground">{label}</span>
      <p className="font-medium">{children || "—"}</p>
    </div>
  );
}
