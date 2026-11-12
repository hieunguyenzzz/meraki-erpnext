import type { ReactNode } from "react";
import { hourVN } from "@/lib/businessTime";
import { formatWeekdayIso } from "@/lib/format";

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Date + greeting; `action` sits on the right (desktop Home: "+ Add expense"). */
export function HomeGreeting({ firstName, action }: { firstName: string; action?: ReactNode }) {
  const now = new Date();
  return (
    <header className="flex flex-wrap items-end gap-3 px-1">
      <div className="min-w-[200px] flex-1">
        <div className="text-sm text-muted-foreground">{formatWeekdayIso(now)}</div>
        <h1 className="mt-0.5 font-display text-3xl font-semibold leading-[34px] md:text-[40px] md:leading-[44px]">
          {greeting(hourVN(now))}{firstName ? `, ${firstName}` : ""}
        </h1>
      </div>
      {action}
    </header>
  );
}
