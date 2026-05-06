import { useState } from "react";
import { cn } from "@/lib/utils";

export function rampColor(score: number, max = 10): string {
  const t = (score - 1) / (max - 1);
  let hue: number;
  if (t < 0.5) hue = 0 + (40 - 0) * (t / 0.5);
  else hue = 40 + (140 - 40) * ((t - 0.5) / 0.5);
  const sat = 70 - 20 * t;
  const light = 55 - 10 * t;
  return `hsl(${hue.toFixed(0)} ${sat.toFixed(0)}% ${light.toFixed(0)}%)`;
}

interface SegmentedRatingProps {
  value: number | null;
  onChange?: (n: number) => void;
  max?: number;
  readOnly?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function SegmentedRating({
  value,
  onChange,
  max = 10,
  readOnly = false,
  size = "md",
  className,
}: SegmentedRatingProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const activeIndex = hoveredIndex !== null ? hoveredIndex : (value != null ? value - 1 : -1);
  const hoverColor = hoveredIndex !== null ? rampColor(hoveredIndex + 1, max) : null;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (readOnly) return;
    const handlers: Record<string, () => void> = {
      ArrowRight: () => onChange?.(Math.min(max, (value ?? 0) + 1)),
      ArrowUp: () => onChange?.(Math.min(max, (value ?? 0) + 1)),
      ArrowLeft: () => onChange?.(Math.max(1, (value ?? 1) - 1)),
      ArrowDown: () => onChange?.(Math.max(1, (value ?? 1) - 1)),
      Home: () => onChange?.(1),
      End: () => onChange?.(max),
    };
    if (handlers[e.key]) {
      e.preventDefault();
      handlers[e.key]();
    }
  }

  const heightClass = size === "sm" ? "h-3" : "h-6";
  const cellMinWidth = size === "sm" ? "min-w-[6px]" : "min-w-[10px]";

  return (
    <div className={cn("flex items-center gap-2 min-w-0", className)}>
      <div
        role="slider"
        aria-valuenow={value ?? 0}
        aria-valuemin={1}
        aria-valuemax={max}
        aria-label="Rating"
        tabIndex={readOnly ? -1 : 0}
        className={cn(
          "flex-1 flex gap-px rounded-md overflow-hidden border border-border bg-border",
          "motion-reduce:transition-none",
          !readOnly && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
        onKeyDown={handleKeyDown}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {Array.from({ length: max }, (_, i) => {
          const isFilled = hoveredIndex !== null ? i <= hoveredIndex : (value != null && i < value);
          const cellColor = isFilled
            ? (hoverColor ?? rampColor(value!, max))
            : undefined;
          const opacity = hoveredIndex !== null && isFilled ? 0.7 : 1;

          if (readOnly) {
            return (
              <div
                key={i}
                className={cn("flex-1 bg-muted transition-colors duration-150", heightClass, cellMinWidth)}
                style={isFilled ? { backgroundColor: cellColor, opacity } : undefined}
              />
            );
          }

          return (
            <button
              key={i}
              type="button"
              className={cn(
                "flex-1 bg-muted transition-colors duration-150 motion-reduce:transition-none",
                heightClass,
                cellMinWidth,
                "hover:bg-muted-foreground/10",
              )}
              style={isFilled ? { backgroundColor: cellColor, opacity } : undefined}
              onClick={() => {
                onChange?.(i + 1);
                setHoveredIndex(null);
              }}
              onMouseEnter={() => setHoveredIndex(i)}
              tabIndex={-1}
            />
          );
        })}
      </div>
      <span className={cn("tabular-nums text-right shrink-0", size === "sm" ? "w-4 text-xs text-muted-foreground" : "w-6 text-sm")}>
        {value ?? "–"}
      </span>
    </div>
  );
}
