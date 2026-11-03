import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatVNDFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PayslipBreakdownView } from "./PayslipBreakdownView";
import { monthIso } from "./payslipBreakdown";
import type { MySlip } from "./types";

interface Props {
  slips: MySlip[];
  commissionComponents: string[];
}

/** Phone layout: one card per month, net pay first, tap to expand the breakdown. */
export function PayslipsMobile({ slips, commissionComponents }: Props) {
  const [openName, setOpenName] = useState<string | null>(slips[0]?.name ?? null);
  return (
    <div className="space-y-2.5">
      {slips.map((slip) => {
        const open = openName === slip.name;
        return (
          <section key={slip.name} className="overflow-hidden rounded-card border bg-card">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenName(open ? null : slip.name)}
              className="flex min-h-[68px] w-full items-center gap-3 px-4 text-left"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="text-base tabular-nums">{monthIso(slip)}</b>
                <span className="text-xs text-muted-foreground">
                  {slip.start_date} – {slip.end_date}
                </span>
              </span>
              <span className="text-[17px] font-bold tabular-nums">{formatVNDFull(slip.net_pay)}</span>
              <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
            </button>
            {open && (
              <div className="border-t px-4 pb-4 pt-3">
                <PayslipBreakdownView slip={slip} commissionComponents={commissionComponents} />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
