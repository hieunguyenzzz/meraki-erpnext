import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { formatAmount } from "./defaults";

interface Props {
  digits: string;
  onChange: (digits: string) => void;
  error?: string;
}

const MAX_DIGITS = 12;

/** Big amount-first field: numeric keypad, thousands separators as you type, tabular figures. */
export const AmountField = forwardRef<HTMLInputElement, Props>(({ digits, onChange, error }, ref) => {
  const shown = formatAmount(digits);
  return (
    <div className="text-center">
      <label htmlFor="expense-amount" className="sr-only">Amount in VND</label>
      <div className="flex items-baseline justify-center gap-2">
        <span className="text-base font-semibold text-muted-foreground" aria-hidden>VND</span>
        <input
          id="expense-amount"
          ref={ref}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="done"
          placeholder="0"
          value={shown}
          aria-invalid={!!error}
          aria-describedby={error ? "expense-amount-error" : undefined}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, MAX_DIGITS))}
          style={{ width: `${Math.max(shown.length, 1) + 0.5}ch` }}
          className={cn(
            "min-w-[2ch] max-w-[70vw] bg-transparent text-center font-semibold tabular-nums tracking-tight outline-none placeholder:text-muted-foreground/60",
            shown.length > 10 ? "text-4xl" : "text-5xl",
            error ? "text-destructive" : "text-foreground"
          )}
        />
      </div>
      <div className="mx-auto mt-1 h-0.5 w-40 rounded-full bg-border" />
      {error && <p id="expense-amount-error" role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
});
AmountField.displayName = "AmountField";
