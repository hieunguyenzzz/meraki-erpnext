export function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm">{value || "-"}</span>
    </div>
  );
}
