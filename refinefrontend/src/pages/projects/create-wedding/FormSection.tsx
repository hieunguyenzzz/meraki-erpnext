import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Titled block of the create-wedding form. */
export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t pt-6 first:border-t-0 first:pt-0">
      <h3 className="font-display text-[24px] font-semibold leading-7">{title}</h3>
      {children}
    </section>
  );
}

/** Label above a control; `required` adds the rose asterisk. */
export function Field({
  label,
  htmlFor,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-[13px] font-semibold leading-4">
        {label}
        {required && <span className="ml-0.5 text-destructive" aria-hidden> *</span>}
      </Label>
      {children}
    </div>
  );
}

/** Two or more choices as large toggle buttons (single select). */
export function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | "";
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-2">
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              "h-12 flex-1 rounded-input border px-3 text-sm font-semibold transition-colors md:h-10",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "border-primary bg-accent text-accent-foreground"
                : "border-input bg-card text-foreground hover:bg-muted"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Dashed "+ Add …" row button. */
export function AddRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-12 items-center justify-center gap-1.5 rounded-input border border-dashed border-input text-sm font-semibold text-primary transition-colors hover:bg-muted md:h-10"
    >
      <span aria-hidden>+</span>
      {label}
    </button>
  );
}
