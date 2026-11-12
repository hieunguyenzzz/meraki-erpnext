import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface FieldShellProps {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}

export function FieldShell({ id, label, required, error, className, children }: FieldShellProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
        {required && <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  error?: string;
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel" | "url" | "numeric";
  className?: string;
}

export function TextField({
  id, label, value, onChange, placeholder, type = "text", required, error, autoComplete, inputMode, className,
}: TextFieldProps) {
  return (
    <FieldShell id={id} label={label} required={required} error={error} className={className}>
      <Input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        enterKeyHint="next"
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn("max-md:h-[52px]", error && "border-destructive")}
      />
    </FieldShell>
  );
}

interface TextAreaFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  error?: string;
}

export function TextAreaField({ id, label, value, onChange, placeholder, rows = 3, required, error }: TextAreaFieldProps) {
  return (
    <FieldShell id={id} label={label} required={required} error={error}>
      <Textarea
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn("text-base md:text-sm", error && "border-destructive")}
      />
    </FieldShell>
  );
}

interface ChoiceGroupProps {
  name: string;
  legend: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  error?: string;
  layout: "chips" | "list";
}

/** Native radios (keyboard and screen-reader friendly), styled as chips or full-width rows. */
export function ChoiceGroup({ name, legend, options, value, onChange, required, error, layout }: ChoiceGroupProps) {
  return (
    <fieldset
      className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0"
      aria-required={required || undefined}
      aria-describedby={error ? `${name}-error` : undefined}
      id={name}
    >
      <legend className="mb-2 text-sm font-semibold">
        {legend}
        {required && <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>}
        {required && <span className="sr-only"> (required)</span>}
      </legend>
      <div className={cn(layout === "chips" ? "flex flex-wrap gap-2" : "flex flex-col gap-2")}>
        {options.map((opt) => {
          const checked = value === opt;
          return (
            <label
              key={opt}
              className={cn(
                "relative flex min-h-12 cursor-pointer items-center border text-[15px] font-medium transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
                layout === "chips" ? "rounded-full px-4" : "gap-3 rounded-card px-4",
                checked
                  ? layout === "chips"
                    ? "border-foreground bg-foreground text-background"
                    : "border-primary bg-accent text-accent-foreground"
                  : "border-input bg-card hover:bg-muted",
                error && !checked && "border-destructive"
              )}
            >
              <input
                type="radio"
                name={name}
                value={opt}
                checked={checked}
                onChange={() => onChange(opt)}
                aria-invalid={error ? true : undefined}
                className={cn("accent-primary", layout === "chips" ? "sr-only" : "h-5 w-5 shrink-0")}
              />
              {opt}
            </label>
          );
        })}
      </div>
      {error && <p id={`${name}-error`} className="text-sm text-destructive">{error}</p>}
    </fieldset>
  );
}
