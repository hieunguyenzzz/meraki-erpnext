export function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="shrink-0 text-muted-foreground text-sm">{label}</span>
      <span className="min-w-0 break-words text-right text-sm font-medium">{value || "-"}</span>
    </div>
  );
}
