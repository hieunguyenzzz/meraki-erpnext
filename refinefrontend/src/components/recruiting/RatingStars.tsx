import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { ratingToStars } from "@/lib/recruiting-kanban";

/** Five stars plus "4 / 5" text, so the rating never relies on colour alone. */
export function RatingStars({ value, className }: { value: number | undefined | null; className?: string }) {
  const stars = ratingToStars(value);
  if (!stars) return <span className={cn("text-xs text-muted-foreground", className)}>Not rated</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} role="img" aria-label={`Rating ${stars} out of 5`}>
      <span className="inline-flex gap-0.5" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} className={cn("h-3.5 w-3.5", i < stars ? "fill-warning text-warning" : "text-muted-foreground/30")} />
        ))}
      </span>
      <span className="text-xs font-semibold tabular-nums text-muted-foreground">{stars} / 5</span>
    </span>
  );
}
