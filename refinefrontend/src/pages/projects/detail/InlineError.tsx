import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function InlineError({ message, className }: { message: string | null; className?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className={cn("flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive", className)}>
      <AlertCircle className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}
