import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatAmount } from "./defaults";

export interface SavedSummary {
  amount: string;
  category: string;
  wedding: string;
  date: string;
  hasReceipt: boolean;
  receiptFailed: boolean;
  reference: string;
}

interface Props {
  saved: SavedSummary;
  onAddAnother: () => void;
  onDone: () => void;
}

export function SavedState({ saved, onAddAnother, onDone }: Props) {
  return (
    <div role="status" className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-success-soft text-success-soft-foreground">
        <Check className="h-12 w-12" strokeWidth={2} aria-hidden />
      </div>
      <h1 className="font-display text-4xl font-semibold">Saved</h1>
      <p className="text-2xl font-semibold tabular-nums">VND {formatAmount(saved.amount)}</p>
      <p className="flex flex-wrap justify-center gap-x-2 text-[15px] leading-snug text-muted-foreground">
        <span>{saved.category}</span>
        <span>· {saved.wedding}</span>
        <span className="whitespace-nowrap">· {saved.date}</span>
      </p>
      <p className="-mt-2 text-[15px] text-muted-foreground">
        {saved.receiptFailed
          ? "waiting for approval"
          : `${saved.hasReceipt ? "Bill photo attached" : "No bill photo"} · waiting for approval`}
      </p>
      {saved.receiptFailed && (
        <p role="alert" className="rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
          Saved, but the photo didn't upload. Add it from the expense later.
        </p>
      )}
      <div className="mt-6 flex w-full flex-col gap-3">
        <Button size="lg" className="h-14 text-base" onClick={onAddAnother}>Add another</Button>
        <Button size="lg" variant="outline" className="h-14 text-base" onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}
