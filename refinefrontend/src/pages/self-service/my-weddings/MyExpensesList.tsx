import { Badge } from "@/components/ui/badge";
import { formatVNDFull } from "@/lib/format";
import type { MyWeddingDetail } from "@/hooks/useMyWeddings";

const VARIANT = { Approved: "success", Rejected: "destructive", Pending: "warning" } as const;

/** The viewer's own expenses on one wedding, with status. */
export function MyExpensesList({ expenses }: { expenses: MyWeddingDetail["my_expenses"] }) {
  if (expenses.length === 0) return <p className="text-sm text-muted-foreground">You have not logged any expenses here.</p>;
  return (
    <ul className="flex flex-col text-sm">
      {expenses.map((e) => (
        <li key={e.name} className="flex min-h-11 items-center justify-between gap-2 border-t py-2 first:border-t-0 first:pt-0">
          <div className="min-w-0">
            <p className="truncate">{e.description || e.name}</p>
            <p className="text-xs text-muted-foreground tabular-nums">{e.date}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <b className="tabular-nums">{formatVNDFull(e.amount)}</b>
            <Badge variant={VARIANT[e.status as keyof typeof VARIANT] ?? "warning"}>{e.status}</Badge>
          </div>
        </li>
      ))}
    </ul>
  );
}
