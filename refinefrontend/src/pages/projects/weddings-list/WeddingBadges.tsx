import { Badge } from "@/components/ui/badge";
import { daysUntilVN } from "@/lib/businessTime";
import { countdownLabel } from "@/hooks/useMyWeddings";
import { cn } from "@/lib/utils";
import { formatVNDCompact, formatVNDFull } from "@/lib/format";

type BadgeVariant = NonNullable<React.ComponentProps<typeof Badge>["variant"]>;

const STAGE_VARIANT: Record<string, BadgeVariant> = {
  Onboarding: "info",
  Planning: "warning",
  "Final Details": "secondary",
  "Wedding Week": "default",
  "Day-of": "destructive",
  Completed: "success",
};

export function StageBadge({ stage, className }: { stage?: string; className?: string }) {
  const name = stage || "Planning";
  return <Badge variant={STAGE_VARIANT[name] ?? "secondary"} className={className}>{name}</Badge>;
}

export function TypeBadge({ type }: { type?: string }) {
  if (!type) return <Dash />;
  return <Badge variant={type === "HCM" ? "info" : "warning"}>{type}</Badge>;
}

export function TaxBadge({ type }: { type?: string }) {
  if (!type) return <Dash />;
  return type === "vat_included" ? <Badge variant="warning">VAT</Badge> : <Badge variant="secondary">Tax free</Badge>;
}

/** Share of the package paid, from the backend's per_billed (same figure as the wedding page). */
export function PaidBadge({ percent }: { percent?: number | null }) {
  if (percent == null) return <Dash />;
  const rounded = Math.round(percent);
  const variant: BadgeVariant = rounded >= 100 ? "success" : rounded >= 50 ? "warning" : "secondary";
  return <Badge variant={variant} className="tabular-nums">{rounded}% paid</Badge>;
}

/** Compact money with the exact figure on hover / long-press. */
export function Money({ amount }: { amount?: number | null }) {
  if (!amount) return <Dash />;
  return <span title={formatVNDFull(amount)} className="tabular-nums">{formatVNDCompact(amount)}</span>;
}

export function Dash() {
  return <span className="text-muted-foreground">{"—"}</span>;
}

/** "12d" / "Today" / "Past" chip, tinted by how close the wedding is. */
export function Countdown({ date, className }: { date?: string; className?: string }) {
  if (!date) return null;
  const days = daysUntilVN(date);
  const tone =
    days < 0 ? "bg-secondary text-muted-foreground"
    : days <= 7 ? "bg-danger-soft text-danger-soft-foreground"
    : days <= 30 ? "bg-warning-soft text-warning-soft-foreground"
    : "bg-info-soft text-info-soft-foreground";
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold tabular-nums", tone, className)}>
      {countdownLabel(days)}
    </span>
  );
}
