import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatVNDFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PAYROLL_COLUMNS } from "./columns";
import { PayrollCell, SlipStatus, SlipTags } from "./PayrollCell";
import { commissionOf, slipName, type SalarySlip } from "./types";

interface Props {
  slips: SalarySlip[];
  weddingAllowanceMap: Record<string, number>;
  onSetBonus: (employee: string, amount: number) => Promise<boolean>;
}

const SPLITS: [keyof NonNullable<ReturnType<typeof commissionOf>>, string][] = [
  ["lead", "Lead planner"], ["support", "Support planner"], ["assistant", "Assistant"], ["fullPkg", "Full package"], ["partialPkg", "Partial package"],
];

/** Phone layout: one card per employee, net pay up front, tap to expand the full breakdown. */
export function PayrollCards({ slips, weddingAllowanceMap, onSetBonus }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (name: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(name)) next.add(name);
      return next;
    });

  return (
    <div className="flex flex-col gap-3">
      {slips.map((s) => {
        const expanded = open.has(s.name);
        const split = commissionOf(s);
        const panelId = `slip-${s.name.replace(/[^\w-]/g, "-")}`;
        return (
          <article key={s.name} className="rounded-card border bg-card">
            <button
              type="button"
              className="flex min-h-12 w-full flex-col gap-2 p-4 text-left"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => toggle(s.name)}
            >
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-semibold">{slipName(s)}</span>
                <SlipTags slip={s} />
                <SlipStatus slip={s} />
              </span>
              <span className="flex items-end justify-between gap-2">
                <span>
                  <span className="block text-xs text-muted-foreground">Net pay</span>
                  <span className="block text-2xl font-semibold tabular-nums">{formatVNDFull(s.net_pay)}</span>
                </span>
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  {expanded ? "Hide" : "Details"}
                  <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} aria-hidden />
                </span>
              </span>
            </button>
            {expanded && (
              <div id={panelId} className="border-t px-4 py-2">
                <dl className="divide-y">
                  {PAYROLL_COLUMNS.filter((c) => c.id !== "net_pay").map((c) => (
                    <div key={c.id} className="flex min-h-12 items-center justify-between gap-3 text-sm tabular-nums">
                      <dt className="text-muted-foreground">{c.label}</dt>
                      <dd>
                        <PayrollCell touch colId={c.id} slip={s} weddingAllowance={weddingAllowanceMap[s.employee] ?? 0} onSetBonus={onSetBonus} />
                      </dd>
                    </div>
                  ))}
                </dl>
                {split && (
                  <div className="border-t py-3 text-sm">
                    <p className="mb-1 font-medium">Commission breakdown</p>
                    {SPLITS.filter(([k]) => (split[k] as number) > 0).map(([k, label]) => (
                      <p key={k} className="flex justify-between tabular-nums text-muted-foreground">
                        <span>{label}</span><span>{formatVNDFull(split[k] as number)}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
