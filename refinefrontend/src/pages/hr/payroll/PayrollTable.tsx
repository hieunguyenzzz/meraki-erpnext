import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { PAYROLL_COLUMNS } from "./columns";
import { PayrollCell, SlipStatus, SlipTags } from "./PayrollCell";
import { slipName, type SalarySlip } from "./types";

type SortKey = "employee" | "status" | (typeof PAYROLL_COLUMNS)[number]["id"];

interface Props {
  slips: SalarySlip[];
  weddingAllowanceMap: Record<string, number>;
  onSetBonus: (employee: string, amount: number) => Promise<void>;
}

/** Desktop table: wrapper scrolls both ways so the header and the Employee column stay in view. */
export function PayrollTable({ slips, weddingAllowanceMap, onSetBonus }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);

  const rows = useMemo(() => {
    if (!sort) return slips;
    const val = (s: SalarySlip): number | string => {
      if (sort.key === "employee") return slipName(s).toLowerCase();
      if (sort.key === "status") return s.docstatus;
      const col = PAYROLL_COLUMNS.find((c) => c.id === sort.key);
      return col ? col.value(s, weddingAllowanceMap[s.employee] ?? 0) : 0;
    };
    const f = sort.dir === "asc" ? 1 : -1;
    return [...slips].sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * f;
    });
  }, [slips, sort, weddingAllowanceMap]);

  function toggle(key: SortKey) {
    setSort((s) => (s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));
  }

  const head = (k: SortKey, label: string, opts: { right?: boolean; sticky?: boolean } = {}) => {
    const { right, sticky } = opts;
    const active = sort?.key === k;
    const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th
        key={k}
        scope="col"
        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
        className={cn("sticky top-0 z-20 h-11 whitespace-nowrap bg-secondary px-4 text-[13px] font-semibold text-muted-foreground", right ? "text-right" : "text-left", sticky && "left-0 z-30")}
      >
        <button type="button" onClick={() => toggle(k)} className={cn("inline-flex items-center gap-1.5 hover:text-foreground", right && "flex-row-reverse")}>
          {label}
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </button>
      </th>
    );
  };

  return (
    <div className="max-h-[calc(100dvh-24rem)] min-h-[16rem] overflow-auto rounded-card border bg-card">
      <table aria-label="Salary slips" className="w-full min-w-max border-collapse text-sm tabular-nums">
        <thead>
          <tr>
            {head("employee", "Employee", { sticky: true })}
            {PAYROLL_COLUMNS.map((c) => head(c.id, c.label, { right: true }))}
            {head("status", "Status")}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.name} className="group border-t hover:bg-secondary/60">
              <th scope="row" className="sticky left-0 z-10 bg-card px-4 py-3 text-left font-medium group-hover:bg-secondary">
                <div className="flex flex-col gap-1">
                  <span className="whitespace-nowrap">{slipName(s)}</span>
                  <SlipTags slip={s} />
                </div>
              </th>
              {PAYROLL_COLUMNS.map((c) => (
                <td key={c.id} className="whitespace-nowrap px-4 py-3 text-right">
                  <PayrollCell colId={c.id} slip={s} weddingAllowance={weddingAllowanceMap[s.employee] ?? 0} onSetBonus={onSetBonus} />
                </td>
              ))}
              <td className="px-4 py-3"><SlipStatus slip={s} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
