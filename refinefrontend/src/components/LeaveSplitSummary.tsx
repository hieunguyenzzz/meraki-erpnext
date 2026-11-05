export interface SplitPreview {
  requested_days: number;
  total_weekdays: number;
  holidays_excluded: { date: string; description: string }[];
  casual_balance: number;
  needs_split: boolean;
  casual_days: number;
  lwp_days: number;
  casual_to_date: string | null;
  lwp_from_date: string | null;
}

/** "0.5 day", "1 day", "2 days": a part-day is still singular. */
const plural = (n: number, word: string) => `${n} ${word}${n === 1 || (n > 0 && n < 1) ? "" : "s"}`;

interface Props {
  preview: SplitPreview;
  fromDate: string;
  toDate: string;
}

/** Day count plus the paid / unpaid split (M-Requests): one strip, then one card per request that will be sent. */
export function LeaveSplitSummary({ preview, fromDate, toDate }: Props) {
  const fullLwp = preview.needs_split && !preview.casual_to_date;
  const partial = preview.needs_split && !!preview.casual_to_date;
  const paid = fullLwp ? 0 : partial ? preview.casual_days : preview.requested_days;
  const unpaid = preview.needs_split ? preview.lwp_days : 0;

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="rounded-xl bg-muted px-4 py-3 text-foreground/80">
        <p className="font-semibold text-foreground">Leave breakdown</p>
        <p>
          {plural(preview.total_weekdays, "weekday")}
          {preview.holidays_excluded.length > 0 && (
            <> − {plural(preview.holidays_excluded.length, "public holiday")} = <strong>{plural(preview.requested_days, "leave day")}</strong></>
          )}
        </p>
        {preview.holidays_excluded.length > 0 && (
          <ul className="mt-1 list-inside list-disc text-xs opacity-80">
            {preview.holidays_excluded.map((h) => (
              <li key={h.date}>{h.description} ({h.date})</li>
            ))}
          </ul>
        )}
      </div>

      <div
        aria-live="polite"
        className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-4 py-3 ${unpaid > 0 ? "bg-warning-soft text-warning-soft-foreground" : "bg-success-soft text-success-soft-foreground"}`}
      >
        <b>{plural(paid, "day")} paid</b>
        <span aria-hidden>·</span>
        <span>{unpaid} unpaid</span>
        <span className="ml-auto text-xs">{unpaid > 0 ? "Over your balance" : "Within balance"}</span>
      </div>

      {partial && (
        <div className="flex flex-col gap-2">
          <div className="rounded-xl bg-success-soft px-4 py-3 text-success-soft-foreground">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide">Request 1 — Annual Leave (paid)</p>
            <p>
              {fromDate} → {preview.casual_to_date}
              {" · "}<strong>{plural(preview.casual_days, "day")}</strong>
            </p>
          </div>
          <div className="rounded-xl bg-warning-soft px-4 py-3 text-warning-soft-foreground">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide">Request 2 — Leave Without Pay (unpaid)</p>
            <p>
              {preview.lwp_from_date ?? "—"} → {toDate}
              {" · "}<strong>{plural(preview.lwp_days, "day")}</strong>
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Your Annual Leave balance is {plural(preview.casual_balance, "day")}. The remaining {plural(preview.lwp_days, "day")} will be unpaid.
          </p>
        </div>
      )}

      {fullLwp && (
        <div className="rounded-xl bg-warning-soft px-4 py-3 text-warning-soft-foreground">
          <p className="text-xs font-semibold uppercase tracking-wide">Leave Without Pay (unpaid)</p>
          <p>
            {fromDate} → {toDate}
            {" · "}<strong>{plural(preview.lwp_days, "day")}</strong>
          </p>
          <p className="mt-1 text-xs opacity-80">Your Annual Leave balance is exhausted. This leave will be fully unpaid.</p>
        </div>
      )}
    </div>
  );
}
