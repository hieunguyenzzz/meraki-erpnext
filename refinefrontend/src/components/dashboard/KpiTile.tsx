import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatVNDCompact, formatVNDFull } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "danger";

const TONE: Record<Tone, string> = {
  neutral: "text-foreground",
  success: "text-success",
  danger: "text-destructive",
};

interface Props {
  label: string;
  amount: number;
  loading?: boolean;
  tone?: Tone;
  caption?: string;
}

/** Headline money figure: compact value that never overflows; tap shows the exact amount. */
export function KpiTile({ label, amount, loading, tone = "neutral", caption }: Props) {
  const [open, setOpen] = useState(false);
  const full = formatVNDFull(amount);
  return (
    <div className="min-w-0 rounded-card border bg-card text-card-foreground">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        disabled={loading}
        title={loading ? undefined : full}
        className="block w-full min-w-0 rounded-card p-3 text-left disabled:cursor-default sm:p-5"
      >
        <div className="text-xs text-muted-foreground sm:text-sm">{label}</div>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-24" />
        ) : (
          <div data-kpi-value aria-hidden className={cn("mt-1 whitespace-nowrap text-xl font-bold tabular-nums sm:text-2xl lg:text-[28px] lg:leading-9", TONE[tone])}>
            {formatVNDCompact(amount)}
          </div>
        )}
        {!loading && <span className="sr-only">{full}. Tap to {open ? "hide" : "show"} the exact amount.</span>}
        {open && !loading && <div className="mt-1 break-words text-xs tabular-nums text-muted-foreground">{full}</div>}
        {caption && !loading && <div className="mt-1 text-xs text-muted-foreground sm:text-sm">{caption}</div>}
      </button>
    </div>
  );
}
