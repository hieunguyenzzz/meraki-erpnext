import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface FieldShellProps {
  id: string;
  label: string;
  required?: boolean;
  /** Shown beside the label when the field is not required. */
  optional?: boolean;
  children: ReactNode;
}

function FieldShell({ id, label, required, optional, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-sm font-semibold leading-snug">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-1 text-destructive">
            *
          </span>
        )}
        {optional && !required && (
          <span className="ml-2 text-[13px] font-normal text-muted-foreground">optional</span>
        )}
      </Label>
      {children}
    </div>
  );
}

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  optional?: boolean;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: "numeric" | "text" | "tel" | "email" | "url";
}

export function TextField({
  id,
  label,
  value,
  onChange,
  required,
  optional,
  type = "text",
  placeholder,
  autoComplete,
  inputMode,
}: TextFieldProps) {
  return (
    <FieldShell id={id} label={label} required={required} optional={optional}>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-required={required || undefined}
        className="h-12 text-base"
      />
    </FieldShell>
  );
}

interface TextAreaFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  optional?: boolean;
  placeholder?: string;
  rows?: number;
}

export function TextAreaField({
  id,
  label,
  value,
  onChange,
  required,
  optional,
  placeholder,
  rows = 5,
}: TextAreaFieldProps) {
  return (
    <FieldShell id={id} label={label} required={required} optional={optional}>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        aria-required={required || undefined}
        className="resize-none text-base leading-relaxed"
      />
    </FieldShell>
  );
}

export { FieldShell };
