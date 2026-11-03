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
  inputMode?: "tel" | "email";
  className?: string;
}

export function Field({ id, label, form, setField, type, placeholder, inputMode, className }: Props) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
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
