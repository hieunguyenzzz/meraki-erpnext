import { createContext, useContext, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** The field that failed validation, so its input can show aria-invalid and its own message. */
export const FieldErrorContext = createContext<{ id: string; message: string } | null>(null);

export function useFieldError(id: string, own?: string): string {
  const ctx = useContext(FieldErrorContext);
  return own || (ctx && ctx.id === id ? ctx.message : "");
}

interface FieldShellProps {
  id: string;
  label: string;
  required?: boolean;
  /** Shown beside the label when the field is not required. */
  optional?: boolean;
  /** Overrides the validation error from context (e.g. a rejected file). */
  error?: string;
  children: ReactNode;
}

function FieldShell({ id, label, required, optional, error, children }: FieldShellProps) {
  const message = useFieldError(id, error);
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
      {message && (
        <p id={`${id}-error`} className="text-[13px] font-medium text-destructive">
          {message}
        </p>
      )}
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
  const invalid = !!useFieldError(id);
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
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
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
  const invalid = !!useFieldError(id);
  return (
    <FieldShell id={id} label={label} required={required} optional={optional}>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        className="resize-none text-base leading-relaxed"
      />
    </FieldShell>
  );
}

export { FieldShell };
