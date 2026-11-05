import { useEffect, useRef } from "react";
import { Check } from "lucide-react";

export function SuccessScreen({ coupleName }: { coupleName: string }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    window.scrollTo(0, 0);
    headingRef.current?.focus();
  }, []);

  return (
    <section
      role="status"
      className="mx-auto mt-6 flex w-full max-w-xl flex-col items-center gap-3 rounded-sheet border border-border bg-card px-6 py-10 text-center md:mt-12 md:p-10"
    >
      <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-success-soft text-success-soft-foreground">
        <Check className="h-8 w-8" aria-hidden="true" />
      </div>
      <h1 ref={headingRef} tabIndex={-1} className="font-display text-4xl font-semibold leading-tight outline-none">
        Thank you{coupleName.trim() ? `, ${coupleName.trim()}` : ""}
      </h1>
      <p className="font-semibold">Your response has been recorded.</p>
      <p className="max-w-md text-base text-muted-foreground">We'll be in touch within 48 hours.</p>
    </section>
  );
}
