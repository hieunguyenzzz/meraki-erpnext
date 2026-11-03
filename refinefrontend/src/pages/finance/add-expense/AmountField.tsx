import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { formatAmount } from "./defaults";

interface Props {
  digits: string;
  onChange: (digits: string) => void;
  error?: string;
}

const MAX_DIGITS = 12;

/** Big amount-first field: numeric keypad, thousands separators as you type, tabular figures, "000" quick key. */
export const AmountField = forwardRef<HTMLInputElement, Props>(({ digits, onChange, error }, ref) => {
  const shown = formatAmount(digits);
  const separators = Math.max(0, Math.ceil(digits.length / 3) - 1);
  const set = (raw: string) => onChange(raw.replace(/\D/g, "").replace(/^0+/, "").slice(0, MAX_DIGITS));

  return (
    <div>
      <label htmlFor="expense-amount" className="sr-only">Amount in VND</label>
      <div className="relative flex min-h-16 items-center justify-center">
        <span className="absolute left-0 text-base font-semibold text-muted-foreground" aria-hidden>VND</span>
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
          onChange={(e) => set(e.target.value)}
          style={{ width: `${Math.max(digits.length, 1) + separators * 0.4 + 0.6}ch` }}
          className={cn(
            "min-w-[3ch] max-w-[calc(100%-9rem)] border-b-2 bg-transparent text-center font-semibold tabular-nums tracking-tight outline-none placeholder:text-muted-foreground/60",
            digits.length > 9 ? "text-3xl" : "text-5xl",
            error ? "border-destructive text-destructive" : "border-border text-foreground focus:border-primary"
          )}
        />
        <button
          type="button"
          aria-label="Add three zeros"
          disabled={!digits}
          // keep the keyboard open and the input focused
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => set(digits + "000")}
          className="absolute right-0 h-12 min-w-12 rounded-full border border-input bg-card px-3 text-sm font-semibold tabular-nums disabled:opacity-40"
        >
          000
        </button>
      </div>
      {error && <p id="expense-amount-error" role="alert" className="mt-2 text-center text-sm text-destructive">{error}</p>}
    </div>
  );
});
AmountField.displayName = "AmountField";
