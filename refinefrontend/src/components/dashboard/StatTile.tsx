import { Link } from "react-router";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  label: string;
  value: string | null;
  to: string;
  sub?: string;
  error?: boolean;
}

/** Small linked stat (leave left, open leads, payslip). value null = still loading. */
export function StatTile({ label, value, to, sub, error }: Props) {
  return (
    <Link to={to} className="flex min-w-0 flex-col gap-0.5 rounded-card border bg-card p-3 transition-colors hover:bg-accent/50 md:gap-1 md:px-5 md:py-[18px]">
      <span className="text-xs text-muted-foreground md:text-[13px]">{label}</span>
      {error ? (
        <span className="text-sm text-danger-soft-foreground">Unavailable</span>
      ) : value === null ? (
        <Skeleton className="mt-1 h-6 w-16" />
      ) : (
        <b className="truncate text-lg tabular-nums md:text-[24px] md:leading-8">{value}</b>
      )}
      {sub && <span className="truncate text-xs text-muted-foreground">{sub}</span>}
    </Link>
  );
}
