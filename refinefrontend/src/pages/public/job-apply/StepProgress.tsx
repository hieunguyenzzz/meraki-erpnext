interface StepProgressProps {
  step: number;
  labels: string[];
}

export function StepProgress({ step, labels }: StepProgressProps) {
  const total = labels.length;
  return (
    <div
      role="progressbar"
      aria-valuenow={step}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuetext={`Step ${step} of ${total}: ${labels[step - 1]}`}
      aria-label="Application progress"
      className="flex flex-col gap-1.5"
    >
      <div className="h-1.5 rounded-full bg-border">
        <div
          className="h-1.5 rounded-full bg-primary-fill transition-all"
          style={{ width: `${(step / total) * 100}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        {labels.map((label, i) => {
          const n = i + 1;
          return (
            <span
              key={label}
              className={n === step ? "font-bold text-accent-foreground" : undefined}
              aria-current={n === step ? "step" : undefined}
            >
              {n < step ? `${label} ✓` : label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
