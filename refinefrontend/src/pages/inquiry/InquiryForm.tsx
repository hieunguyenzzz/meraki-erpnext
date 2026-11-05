import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { StepFields } from "./StepFields";
import { StepNav } from "./StepNav";
import { SuccessScreen } from "./SuccessScreen";
import { INITIAL_FORM, STEPS, isMissing, type FieldName, type InquiryFormData } from "./types";

const LAST = STEPS.length - 1;
const REQUIRED_MSG = "This question is required.";

function describeError(err: unknown): string {
  if (err instanceof TypeError) {
    return "We couldn't reach our server. Please check your connection and try again. Your answers are still here.";
  }
  const msg = err instanceof Error ? err.message : "";
  return `${msg || "Something went wrong."} Please try again. Your answers are still here.`;
}

export function InquiryForm() {
  const [form, setForm] = useState<InquiryFormData>(INITIAL_FORM);
  const [params, setParams] = useSearchParams();
  const [announce, setAnnounce] = useState("");
  const [shown, setShown] = useState<Partial<Record<FieldName, true>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { executeRecaptcha } = useGoogleReCaptcha();
  const isDesktop = useMediaQuery("(min-width: 768px)");

  // The step lives in the URL (?step=1..4) so the phone back gesture returns to the previous step.
  // Junk values fall back to 1, and nobody can jump past a step with an unanswered required question.
  const requested = (() => {
    const n = Number(params.get("step"));
    return Number.isInteger(n) && n >= 1 && n <= STEPS.length ? n - 1 : 0;
  })();
  const firstIncomplete = STEPS.findIndex((s) => s.fields.some((f) => isMissing(form, f)));
  const step = Math.min(requested, firstIncomplete === -1 ? LAST : firstIncomplete);
  const setStep = useCallback(
    (i: number) => setParams({ step: String(i + 1) }),
    [setParams]
  );

  const dirty = !submitted && Object.values(form).some((v) => v.trim() !== "");
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const errors = useMemo(() => {
    const out: Partial<Record<FieldName, string>> = {};
    for (const f of Object.keys(shown) as FieldName[]) {
      if (isMissing(form, f)) out[f] = REQUIRED_MSG;
    }
    return out;
  }, [shown, form]);

  // New step: back to the top and move focus to the heading for screen readers.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setAnnounce("");
    window.scrollTo(0, 0);
    headingRef.current?.focus();
  }, [step]);

  const onChange = useCallback((field: FieldName, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
  }, []);

  /** Reveal errors for the given step; returns true when the step is complete. */
  const validateStep = useCallback(
    (i: number): boolean => {
      const missing = STEPS[i].fields.filter((f) => isMissing(form, f));
      if (missing.length === 0) return true;
      setShown((s) => {
        const next = { ...s };
        for (const f of missing) next[f] = true;
        return next;
      });
      setAnnounce("");
      setTimeout(() => setAnnounce("Please fill the highlighted fields"), 50);
      requestAnimationFrame(() => {
        const el = document.getElementById(missing[0]);
        (el?.tagName === "FIELDSET" ? el.querySelector("input") : el)?.focus();
      });
      return false;
    },
    [form]
  );

  const goNext = useCallback(() => {
    if (validateStep(step)) setStep(Math.min(step + 1, LAST));
  }, [step, validateStep, setStep]);

  const goBack = useCallback(() => setStep(Math.max(step - 1, 0)), [step, setStep]);

  const submit = useCallback(async () => {
    if (submittingRef.current) return;
    for (let i = 0; i < STEPS.length; i++) {
      if (!validateStep(i)) {
        setStep(i);
        return;
      }
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const token = executeRecaptcha ? await executeRecaptcha("inquiry_submit") : "dev-bypass";
      const res = await fetch("/inquiry-api/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, recaptcha_token: token }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Error ${res.status}`);
      }
      setSubmitted(true);
    } catch (err: unknown) {
      console.error("inquiry_submit_failed", err);
      setError(describeError(err));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [executeRecaptcha, form, validateStep, setStep]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step === LAST) void submit();
    else goNext();
  }

  // Enter in a text box must never send the inquiry from the middle of the form.
  function handleKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== "Enter" || (e.target as HTMLElement).tagName !== "INPUT") return;
    e.preventDefault();
    if (step < LAST && (e.target as HTMLInputElement).type !== "radio") goNext();
  }

  function clearAll() {
    if (!window.confirm("Clear all your answers?")) return;
    setForm(INITIAL_FORM);
    setShown({});
    setError(null);
    setStep(0);
  }

  const goTo = (i: number) => {
    if (i < step) setStep(i);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      {/* Hide the floating reCAPTCHA badge (it covers the buttons); the required disclosure is shown below. */}
      <style>{`.grecaptcha-badge{visibility:hidden}`}</style>

      <header className="flex items-center justify-between border-b border-border bg-card px-6 py-4 md:px-8 md:py-5">
        <span className="font-display text-[26px] font-semibold md:text-3xl">Meraki</span>
        <span className="hidden text-sm text-muted-foreground md:inline">Takes about 3 minutes · we reply within 48 hours</span>
      </header>

      {submitted ? (
        <main className="flex-1 px-4 pb-10">
          <SuccessScreen coupleName={form.couple_names} />
        </main>
      ) : (
        <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-6 px-6 pb-32 pt-6 md:flex-row md:gap-12 md:px-8 md:pb-12 md:pt-12">
          <div className="md:w-[260px] md:shrink-0">
            <StepNav step={step} variant={isDesktop ? "sidebar" : "bar"} onGo={goTo} />
          </div>

          <form
            onSubmit={handleSubmit}
            onKeyDown={handleKeyDown}
            noValidate
            aria-label="Wedding inquiry form"
            className="flex min-w-0 max-w-2xl flex-1 flex-col gap-5"
          >
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="font-display text-[34px] font-semibold leading-[38px] outline-none md:text-[44px] md:leading-[48px]"
            >
              {STEPS[step].heading}
            </h1>
            <p className="-mt-2 text-sm text-muted-foreground">
              Tell us about yourselves and the day you've been dreaming of. <span className="text-destructive" aria-hidden="true">*</span>
              <span className="sr-only">Asterisk</span> marks a required question.
            </p>

            <StepFields step={step} form={form} errors={errors} onChange={onChange} />

            <p role="status" aria-live="polite" className="sr-only">{announce}</p>

            {error && (
              <p role="alert" className="rounded-input border border-destructive/30 bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">
                {error}
              </p>
            )}

            <div className="fixed inset-x-0 bottom-0 z-10 flex gap-2.5 border-t border-border bg-card px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 md:static md:z-auto md:border-t md:bg-transparent md:px-0 md:pb-0 md:pt-6">
              {step > 0 && (
                <Button type="button" variant="outline" size="lg" className="max-md:h-14 md:h-[52px]" onClick={goBack} disabled={submitting}>
                  Back
                </Button>
              )}
              {step < LAST ? (
                <Button key="next" type="button" size="lg" className="max-md:h-14 max-md:flex-1 max-md:text-[17px] md:h-[52px] md:px-8" onClick={goNext}>
                  Continue
                </Button>
              ) : (
                <Button key="submit" type="submit" size="lg" className="max-md:h-14 max-md:flex-1 max-md:text-[17px] md:h-[52px] md:px-8" disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit"}
                </Button>
              )}
            </div>

            {step === LAST && (
              <button
                type="button"
                onClick={clearAll}
                className="self-start rounded-input px-1 py-2 text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Clear form
              </button>
            )}

            <p className="text-xs text-muted-foreground">
              This form is protected by reCAPTCHA and the Google{" "}
              <a className="text-primary underline" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>{" "}
              and{" "}
              <a className="text-primary underline" href="https://policies.google.com/terms" target="_blank" rel="noreferrer">Terms of Service</a>{" "}
              apply.
            </p>
          </form>
        </main>
      )}
    </div>
  );
}
