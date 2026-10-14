import { useMemo } from "react";
import { formatVND } from "@/lib/format";

export interface ExpenseCategory { name: string; account_name: string; }

interface Props {
  expenses: any[];
  categories: ExpenseCategory[];
}

export function ExpenseCategorySummary({ expenses, categories }: Props) {
  const { rows, totals } = useMemo(() => {
    const byCategory = new Map<string, { label: string; approved: number; pending: number }>();
    for (const e of expenses) {
      if (e.status === "Rejected") continue;
      const key: string = e.category || "";
      let row = byCategory.get(key);
      if (!row) {
        row = {
          label: key ? (categories.find(c => c.name === key)?.account_name ?? key) : "Uncategorised",
          approved: 0,
          pending: 0,
        };
        byCategory.set(key, row);
      }
      if (e.status === "Approved") row.approved += e.amount || 0;
      else row.pending += e.amount || 0;
    }
    const rows = [...byCategory.values()]
      .map(r => ({ ...r, total: r.approved + r.pending }))
      .sort((a, b) => b.total - a.total);
    const totals = rows.reduce(
      (t, r) => ({ approved: t.approved + r.approved, pending: t.pending + r.pending, total: t.total + r.total }),
      { approved: 0, pending: 0, total: 0 }
    );
    return { rows, totals };
  }, [expenses, categories]);

  if (rows.length === 0) return null;

  return (
    <div className="mb-4">
      <h4 className="text-sm font-medium mb-2">Spending by category</h4>
      <div className="border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left font-medium">Category</th>
              <th className="px-3 py-2 text-right font-medium">Approved</th>
              <th className="px-3 py-2 text-right font-medium">Pending</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label} className="border-b last:border-0">
                <td className="px-3 py-2">{r.label}</td>
                <td className="px-3 py-2 text-right">{formatVND(r.approved)}</td>
                <td className="px-3 py-2 text-right">{formatVND(r.pending)}</td>
                <td className="px-3 py-2 text-right">{formatVND(r.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/50 font-medium">
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right">{formatVND(totals.approved)}</td>
              <td className="px-3 py-2 text-right">{formatVND(totals.pending)}</td>
              <td className="px-3 py-2 text-right">{formatVND(totals.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
