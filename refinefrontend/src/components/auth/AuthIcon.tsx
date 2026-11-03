import type { ReactNode } from "react";

/** Sage circle used for the "Check your email" and "Password updated" confirmations. */
export function AuthIcon({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success-soft text-success-soft-foreground" aria-hidden="true">
      {children}
    </div>
  );
}
