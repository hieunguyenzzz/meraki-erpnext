import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatVNDPlain } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PayslipBreakdownView } from "./PayslipBreakdownView";
import { monthIso } from "./payslipBreakdown";
import type { MySlip } from "./types";

interface Props {
  slips: MySlip[];
  commissionComponents: string[];
}

const GRID = "grid grid-cols-[1.4fr_1fr_1fr_1fr_40px] items-center gap-2 tabular-nums";

/** Desktop layout (D-MePayslips): one table row per month, the selected row opens its earnings and deductions underneath. */
export function PayslipsDesktop({ slips, commissionComponents }: Props) {
  const [openName, setOpenName] = useState<string | null>(slips[0]?.name ?? null);
  return (
    <section className="overflow-x-auto rounded-card border bg-card" aria-label="Payslips">
      <div className="min-w-[600px]">
        <div className={cn(GRID, "bg-muted px-[18px] py-3 text-[13px] font-semibold text-muted-foreground")}>
          <span>Month</span>
          <span className="text-right">Gross (VND)</span>
          <span className="text-right">Deductions (VND)</span>
          <span className="text-right">Net pay (VND)</span>
          <span />
        </div>
        {slips.map((slip) => {
          const open = openName === slip.name;
          const deductions = slip.total_deduction;
          return (
            <div key={slip.name} className="border-t">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`payslip-${slip.name}`}
                onClick={() => setOpenName(open ? null : slip.name)}
                className={cn(GRID, "min-h-[60px] w-full px-[18px] text-left text-[15px] hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", open && "bg-background")}
              >
                <span>
                  <b>{monthIso(slip)}</b>
                  <span className="block text-xs text-muted-foreground">Posted {slip.posting_date}</span>
                </span>
                <span className="text-right">{formatVNDPlain(slip.gross_pay)}</span>
                <span className="text-right text-muted-foreground">{deductions > 0 ? "−" : ""}{formatVNDPlain(deductions)}</span>
                <b className="text-right">{formatVNDPlain(slip.net_pay)}</b>
                <ChevronDown className={cn("h-5 w-5 justify-self-end text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
              </button>
              {open && (
                <div id={`payslip-${slip.name}`} role="region" aria-label={`Payslip ${monthIso(slip)}`} className="bg-background px-[18px] pb-[18px] pt-2">
                  <PayslipBreakdownView slip={slip} commissionComponents={commissionComponents} layout="columns" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
