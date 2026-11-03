import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  stars: number;
  onChange: (stars: number) => void;
  disabled?: boolean;
}

/** 5-star rating with a "n / 5" text label; tapping the current value clears it. */
export function RatingStars({ stars, onChange, disabled }: Props) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex items-center gap-2">
      <span role="group" aria-label="Rating" className="flex items-center" onMouseLeave={() => setHovered(0)}>
        {[1, 2, 3, 4, 5].map((i) => {
          const filled = hovered > 0 ? i <= hovered : i <= stars;
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              aria-label={`${i} star${i > 1 ? "s" : ""}`}
              aria-pressed={i <= stars}
              onMouseEnter={() => setHovered(i)}
              onClick={() => onChange(i)}
              className="flex h-11 w-9 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 md:h-8 md:w-7"
            >
              <Star className={cn("h-5 w-5 transition-colors", filled ? "fill-warning text-warning" : "text-muted-foreground/40")} />
            </button>
          );
        })}
      </span>
      <span className="text-sm text-muted-foreground">{stars > 0 ? `${stars} / 5` : "Not rated"}</span>
    </div>
  );
}
