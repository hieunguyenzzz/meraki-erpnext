import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { formatIsoWeekday } from "@/lib/format";
import { cn } from "@/lib/utils";

export function countdownTile(days: number | null): { value: string; unit: string } | null {
  if (days == null) return null;
  if (days === 0) return { value: "0", unit: "today" };
  if (days < 0) return { value: String(-days), unit: -days === 1 ? "day ago" : "days ago" };
  return { value: String(days), unit: days === 1 ? "day" : "days" };
}

interface Props {
  title: string;
  date: string | null | undefined;
  /** Facts after the date, e.g. venue, guests. */
  facts?: (string | null | undefined)[];
  /** Status badges next to the facts. */
  badges?: ReactNode;
  /** One muted line under the facts, e.g. the viewer's role. */
  subtitle?: string;
  daysToGo: number | null;
  onBack: () => void;
  actions?: ReactNode;
}

/** Wedding header shared by the planner page and the staff page: back, couple name, date line, countdown, actions. */
export function WeddingHero({ title, date, facts = [], badges, subtitle, daysToGo, onBack, actions }: Props) {
  const tile = countdownTile(daysToGo);
  const dayOf = daysToGo === 0;
  const line = [date ? formatIsoWeekday(date) : null, ...facts].filter(Boolean);
  return (
    <header className="flex flex-col gap-3">
      <div className="-ml-2 flex items-center justify-between">
        <button type="button" onClick={onBack} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 lg:hidden">{actions}</div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {tile && (
          <div
            className={cn(
              "hidden h-20 w-[76px] shrink-0 flex-col items-center justify-center rounded-card sm:flex",
              dayOf ? "bg-primary-fill text-primary-fill-foreground" : "bg-accent text-accent-foreground"
            )}
            aria-label={`${tile.value} ${tile.unit}`}
          >
            <span className="font-display text-[38px] font-semibold leading-9 lining-nums tabular-nums">{tile.value}</span>
            <span className="text-xs font-semibold">{tile.unit}</span>
          </div>
        )}
        <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1.5">
          {tile && (
            <span
              className={cn(
                "inline-flex h-[26px] items-center gap-1.5 self-start rounded-full px-2.5 text-xs font-bold sm:hidden",
                dayOf ? "bg-primary-fill text-primary-fill-foreground" : "bg-accent text-accent-foreground"
              )}
            >
              <span className="h-[7px] w-[7px] rounded-full bg-current" aria-hidden />
              {dayOf ? "Wedding day" : daysToGo! > 0 ? `In ${tile.value} ${tile.unit}` : `${tile.value} ${tile.unit}`}
            </span>
          )}
          <h1 className="break-words font-display text-[40px] font-semibold leading-[44px] lining-nums">{title}</h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted-foreground">
            {line.map((f, i) => (
              <span key={i} className="flex items-center gap-2 tabular-nums">
                {i > 0 && <span aria-hidden>·</span>}
                {f}
              </span>
            ))}
            {badges}
          </div>
          {subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
        </div>
        <div className="hidden items-center gap-2 lg:flex">{actions}</div>
      </div>
    </header>
  );
}
