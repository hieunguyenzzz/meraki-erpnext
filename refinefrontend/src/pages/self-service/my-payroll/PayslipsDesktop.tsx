import { useState } from "react";
import { formatVNDFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PayslipBreakdownView } from "./PayslipBreakdownView";
import { monthIso } from "./payslipBreakdown";
import type { MySlip } from "./types";

interface Props {
  slips: MySlip[];
  commissionComponents: string[];
}

/** Desktop layout: month list on the left, selected payslip's breakdown on the right. */
export function PayslipsDesktop({ slips, commissionComponents }: Props) {
  const [selectedName, setSelectedName] = useState(slips[0]?.name);
  const selected = slips.find((s) => s.name === selectedName) ?? slips[0];
  return (
    <div className="grid grid-cols-[320px_minmax(0,1fr)] items-start gap-6">
      <ul className="space-y-2" aria-label="Payslips">
        {slips.map((slip) => {
          const active = slip.name === selected.name;
          return (
            <li key={slip.name}>
              <button
                type="button"
                aria-current={active}
                onClick={() => setSelectedName(slip.name)}
                className={cn(
                  "flex min-h-[64px] w-full items-center gap-3 rounded-card border bg-card px-4 text-left transition-colors hover:bg-secondary",
                  active && "border-primary bg-accent hover:bg-accent"
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <b className="text-base tabular-nums">{monthIso(slip)}</b>
                  <span className="text-xs text-muted-foreground">Paid {slip.posting_date}</span>
                </span>
                <span className="font-bold tabular-nums">{formatVNDFull(slip.net_pay)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <section className="rounded-card border bg-card p-6" aria-label={`Payslip ${monthIso(selected)}`}>
        <header className="mb-5">
          <h2 className="text-2xl font-semibold tabular-nums">{monthIso(selected)}</h2>
          <p className="text-sm text-muted-foreground">
            {selected.start_date} – {selected.end_date} · Paid {selected.posting_date}
          </p>
        </header>
        <PayslipBreakdownView slip={selected} commissionComponents={commissionComponents} />
      </section>
    </div>
  );
}
