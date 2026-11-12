import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T | "";
  onChange: (value: T) => void;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
  itemClassName?: string;
}

/** Pill radio group with roving tabindex: Tab enters once, arrow keys move and select. */
export function RadioChipGroup<T extends string>({ options, value, onChange, className, itemClassName, ...aria }: Props<T>) {
  const selectedIndex = options.findIndex((o) => o.value === value);
  const tabStop = selectedIndex >= 0 ? selectedIndex : 0;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step || options.length === 0) return;
    e.preventDefault();
    const next = (tabStop + step + options.length) % options.length;
    onChange(options[next].value);
    (e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next])?.focus();
  }

  return (
    <div role="radiogroup" onKeyDown={onKeyDown} className={className} {...aria}>
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          tabIndex={i === tabStop ? 0 : -1}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-11 rounded-full border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === o.value ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:bg-muted",
            itemClassName,
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
