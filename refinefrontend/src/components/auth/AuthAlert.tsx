/** Inline error, announced to screen readers when it appears. */
export function AuthAlert({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <div id={id} role="alert" className="rounded-[10px] bg-danger-soft px-3.5 py-2.5 text-sm text-danger-soft-foreground">
      {children}
    </div>
  );
}
