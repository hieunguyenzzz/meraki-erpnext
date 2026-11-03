import type { ReactNode } from "react";
import { AlertCircle, HeartHandshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  kind: "empty" | "error";
  title: string;
  text: string;
  action?: { label: string; onClick: () => void; icon?: ReactNode };
  className?: string;
}

/** Empty / error block per Components.dc.html: tinted circle, title, one line, one action. */
export function StatePanel({ kind, title, text, action, className }: Props) {
  const Icon = kind === "error" ? AlertCircle : HeartHandshake;
  return (
    <div role={kind === "error" ? "alert" : undefined} className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      <div className={cn("flex h-[88px] w-[88px] items-center justify-center rounded-full", kind === "error" ? "bg-danger-soft text-destructive" : "bg-accent text-primary")}>
        <Icon className="h-10 w-10" strokeWidth={1.4} />
      </div>
      <b className="text-lg">{title}</b>
      <p className="max-w-xs text-sm text-muted-foreground">{text}</p>
      {action && (
        <Button variant={kind === "error" ? "default" : "outline"} onClick={action.onClick}>
          {action.icon}
          {action.label}
        </Button>
      )}
    </div>
  );
}
