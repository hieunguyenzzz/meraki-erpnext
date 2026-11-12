import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  step: number;
  title: string;
  missing: number;
  children: ReactNode;
}

/** Form section with a completion marker: numbered circle until its required fields are filled, then a sage tick. */
export function SectionCard({ step, title, missing, children }: Props) {
  const done = missing === 0;
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0 pb-3 sm:pb-4">
        <span
          aria-hidden
          className={cn(
            "flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-xs font-bold",
            done ? "bg-success-soft text-success-soft-foreground" : "border-2 border-primary text-primary",
          )}
        >
          {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.6} /> : step}
        </span>
        <CardTitle className="flex-1">{title}</CardTitle>
        <span className={cn("text-xs font-medium", done ? "text-success" : "text-muted-foreground")}>
          {done ? "Complete" : `${missing} to fill`}
        </span>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
