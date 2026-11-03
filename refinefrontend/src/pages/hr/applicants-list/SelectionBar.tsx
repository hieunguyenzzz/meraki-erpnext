import { Button } from "@/components/ui/button";

interface Props {
  count: number;
  sending: boolean;
  error: string;
  onSend: () => void;
  onClear: () => void;
}

/** Floating bar for the batch action; sits above the phone bottom bar. */
export function SelectionBar({ count, sending, error, onSend, onClear }: Props) {
  return (
    <div
      role="region"
      aria-label="Selected applicants"
      className="fixed inset-x-4 bottom-[calc(96px+env(safe-area-inset-bottom,0px))] z-40 flex flex-col gap-2 rounded-2xl border bg-card p-3 shadow-lg md:inset-x-auto md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:flex-row md:items-center md:gap-3 md:px-4 md:py-2.5"
    >
      <span className="text-sm font-semibold">{count} selected</span>
      {error && <span role="alert" className="text-sm text-destructive">{error}</span>}
      <div className="flex gap-2">
        <Button className="flex-1 md:flex-none" onClick={onSend} disabled={sending}>
          {sending ? "Sending..." : "Send to Scanner"}
        </Button>
        <Button className="flex-1 md:flex-none" variant="outline" onClick={onClear} disabled={sending}>Clear</Button>
      </div>
    </div>
  );
}
