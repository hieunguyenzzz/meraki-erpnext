import type { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/** A titled card on the lead page; children are label/value rows. */
export function InfoCard({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {icon}
          {title}
        </h2>
      </CardHeader>
      <CardContent className="space-y-2.5 sm:pt-0">{children}</CardContent>
    </Card>
  );
}
