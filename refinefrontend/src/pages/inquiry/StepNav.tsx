import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEPS } from "./types";

interface StepNavProps {
  step: number;
  variant: "sidebar" | "bar";
  onGo: (i: number) => void;
}

/** Desktop: vertical stepper. Phone: four-segment progress bar with "Step n of 4". */
export function StepNav({ step, variant, onGo }: StepNavProps) {
  if (variant === "bar") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-muted-foreground">Step {step + 1} of {STEPS.length} · {STEPS[step].title}</p>
        <div
          role="progressbar"
          aria-label="Inquiry progress"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={step + 1}
          className="flex gap-1.5"
        >
          {STEPS.map((s, i) => (
            <span key={s.title} className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-primary-fill" : "bg-border")} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <nav aria-label="Inquiry steps" className="flex max-w-[260px] flex-col gap-1">
      {STEPS.map((s, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <button
            key={s.title}
            type="button"
            disabled={i > step}
            aria-current={current ? "step" : undefined}
            onClick={() => onGo(i)}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-input text-left text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              current && "font-bold",
              i > step && "cursor-default text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold",
                done && "bg-success text-success-foreground",
                current && "bg-primary-fill text-primary-fill-foreground",
                i > step && "border-2 border-input"
              )}
            >
              {done ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
            </span>
            {s.title}
            {done && <span className="sr-only"> (completed, edit)</span>}
          </button>
        );
      })}
    </nav>
  );
}
