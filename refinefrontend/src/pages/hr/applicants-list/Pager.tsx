import { Button } from "@/components/ui/button";

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}

/** Desktop table footer: range shown and Previous / Next. */
export function Pager({ page, pageSize, total, onPage }: Props) {
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="flex items-center justify-between border-t px-4 py-3 text-[13px] text-muted-foreground">
      <span className="tabular-nums">{from}–{to} of {total}</span>
      <span className="flex gap-1.5">
        <Button variant="outline" className="h-9" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button variant="outline" className="h-9" disabled={to >= total} onClick={() => onPage(page + 1)}>Next</Button>
      </span>
    </div>
  );
}
