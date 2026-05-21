import * as React from "react";
import { Input } from "./input";

type MoneyInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "inputMode"
> & {
  value: string;
  onChange: (rawDigits: string) => void;
};

function formatThousands(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, ...rest }, ref) => {
    return (
      <Input
        ref={ref}
        type="text"
        inputMode="numeric"
        value={formatThousands(value)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        {...rest}
      />
    );
  }
);
MoneyInput.displayName = "MoneyInput";

export { MoneyInput };
