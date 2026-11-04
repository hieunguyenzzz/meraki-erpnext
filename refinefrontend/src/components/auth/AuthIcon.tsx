import type { ReactNode } from "react";

/** Round icon for the "Check your email", "Password updated" (sage) and "Link expired" (gold) screens. */
export function AuthIcon({ children, tone = "success" }: { children: ReactNode; tone?: "success" | "warning" }) {
  const colours = tone === "warning" ? "bg-warning-soft text-warning-soft-foreground" : "bg-success-soft text-success-soft-foreground";
  return (
    <div className={`flex h-20 w-20 items-center justify-center rounded-full lg:h-16 lg:w-16 ${colours}`} aria-hidden="true">
      {children}
    </div>
  );
}
