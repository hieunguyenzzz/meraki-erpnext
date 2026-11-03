import type { CSSProperties } from "react";

/** Recharts styling from the redesign tokens, so charts follow light/dark with the rest of the app. */
export const chartColors = {
  revenue: "hsl(var(--primary-fill))",
  expenses: "hsl(var(--gilt))",
  weddings: "hsl(var(--info))",
  net: "hsl(var(--success))",
  grid: "hsl(var(--border))",
  axisText: "hsl(var(--muted-foreground))",
  cursor: "hsl(var(--muted))",
} as const;

export const axisTick = { fill: chartColors.axisText, fontSize: 11 } as const;

export const tooltipStyles: {
  contentStyle: CSSProperties;
  labelStyle: CSSProperties;
  itemStyle: CSSProperties;
} = {
  contentStyle: {
    background: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    color: "hsl(var(--popover-foreground))",
    fontSize: 12,
    boxShadow: "none",
  },
  labelStyle: { color: "hsl(var(--popover-foreground))", fontWeight: 600 },
  itemStyle: { color: "hsl(var(--popover-foreground))" },
};

/** "2026-03" -> "Mar" */
export function monthShort(ym: string): string {
  if (ym.length === 4) return ym; // all-years view: the label is the year
  const m = Number(ym.slice(5, 7));
  return new Date(2000, m - 1, 1).toLocaleDateString("en-GB", { month: "short" });
}

/** "2026-03" -> "03" (unambiguous, never collides on a phone) */
export function monthNumber(ym: string): string {
  if (ym.length === 4) return ym.slice(2); // "2025" -> "25"
  return ym.slice(5, 7);
}
