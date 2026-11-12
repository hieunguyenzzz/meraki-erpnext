import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Job } from "@/lib/jobs";
import { TextAreaField, TextField } from "./Field";
import { FileField } from "./FileField";
import { DesktopFrame } from "./DesktopScreens";
import { STEP_NAMES, stepsFor, validateDesktopStep, type DesktopStepKey } from "./desktopSteps";
import { STEP_TAP_GUARD_MS, type FormValues, type Level, type SetField } from "./types";

interface Props {
  job: Job;
  level: Level;
  form: FormValues;
  set: SetField;
  cvFile: File | null;
  portfolioFile: File | null;
  onCv: (f: File) => void;
  onPortfolio: (f: File) => void;
  cvRef: React.RefObject<HTMLInputElement | null>;
  portfolioRef: React.RefObject<HTMLInputElement | null>;
  errorText: string;
  errorRef: React.RefObject<HTMLDivElement | null>;
  setValidationError: (message: string) => void;
  clearSubmitError: () => void;
  submitting: boolean;
  onSubmit: () => void;
}

const GRID = "grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4";
const HEADING = "font-display text-[40px] font-semibold leading-[44px]";

export function DesktopApply(p: Props) {
  const { level, form, set } = p;
  const steps = stepsFor(level);
  const senior = level === "Senior";
  const [index, setIndex] = useState(0);
  const stepChangedAt = useRef(0);
  const firstRender = useRef(true);
  const key = steps[index];
  const last = index === steps.length - 1;

  // New step starts at the top, and arms the double-tap guard.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    stepChangedAt.current = Date.now();
    window.scrollTo({ top: 0 });
  }, [index]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (Date.now() - stepChangedAt.current < STEP_TAP_GUARD_MS) return;
    const err = validateDesktopStep(key, level, form, p.cvFile, p.portfolioFile);
    if (err) {
      p.setValidationError(err);
      return;
    }
    p.setValidationError("");
    if (last) p.onSubmit();
    else setIndex(index + 1);
  }

  function back() {
    p.setValidationError("");
    p.clearSubmitError();
    setIndex(index - 1);
  }

  return (
    <DesktopFrame>
      <div className="flex flex-wrap items-center gap-2 rounded-card border bg-card px-5 py-4">
        <h1 className="min-w-[240px] flex-1 text-lg font-bold">{p.job.job_title}</h1>
        <span className="text-sm text-muted-foreground">
          {[p.job.location, p.job.closes_on && `closes ${p.job.closes_on}`].filter(Boolean).join(" · ")}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-valuenow={index + 1}
        aria-valuetext={`Step ${index + 1} of ${steps.length}: ${STEP_NAMES[key]}`}
        aria-label="Application progress"
        className="flex flex-col gap-2"
      >
        <div className="h-1.5 rounded-full bg-border">
          <div
            className="h-1.5 rounded-full bg-primary-fill transition-all"
            style={{ width: `${Math.round(((index + 1) / steps.length) * 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-[13px]">
          {steps.map((k, i) => (
            <span
              key={k}
              aria-current={i === index ? "step" : undefined}
              className={cn(
                i === index && "font-bold text-accent-foreground",
                i < index && "font-medium text-success-soft-foreground",
                i > index && "font-medium text-muted-foreground"
              )}
            >
              {i < index ? "✓ " : ""}
              {STEP_NAMES[k]}
            </span>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        <section className="flex flex-col gap-[18px]">
          <h2 className={HEADING}>{headingFor(key)}</h2>
          {key === "personal" && (
            <div className={GRID}>
              <TextField id="applicant_name" label="Full name" required value={form.applicant_name} onChange={set("applicant_name")} placeholder="Your full name" autoComplete="name" />
              <TextField id="email_id" label="Email address" required type="email" value={form.email_id} onChange={set("email_id")} placeholder="you@example.com" autoComplete="email" inputMode="email" />
              <TextField id="phone_number" label="Phone number" required type="tel" value={form.phone_number} onChange={set("phone_number")} placeholder="+84 ..." autoComplete="tel" />
              <TextField id="custom_city" label="City" optional value={form.custom_city} onChange={set("custom_city")} placeholder="e.g. Ho Chi Minh City" autoComplete="address-level2" />
            </div>
          )}
          {key === "background" && (
            <>
              {level !== "Intern" && (
                <div className={GRID}>
                  <TextField id="education_degree" label="Degree / qualification" required={senior} optional value={form.education_degree} onChange={set("education_degree")} placeholder="e.g. Bachelor of Arts" />
                  <TextField id="institution" label="Institution" required={senior} optional value={form.institution} onChange={set("institution")} placeholder="University or college name" />
                  <TextField id="graduation_year" label="Graduation year" required={senior} optional value={form.graduation_year} onChange={set("graduation_year")} placeholder="e.g. 2021" inputMode="numeric" />
                </div>
              )}
              <TextAreaField id="work_experience" label="Work experience" required={senior} optional rows={4} value={form.work_experience} onChange={set("work_experience")} placeholder="Describe your relevant experience, roles held, key achievements..." />
              <TextField id="custom_linkedin_url" label="LinkedIn profile URL" optional type="url" value={form.custom_linkedin_url} onChange={set("custom_linkedin_url")} placeholder="https://linkedin.com/in/..." inputMode="url" />
            </>
          )}
          {key === "portfolio" && (
            <>
              <p className="text-[15px] text-muted-foreground">Extra for senior roles.</p>
              <FileField id="portfolio_file" label="Portfolio" required file={p.portfolioFile} onFile={p.onPortfolio} inputRef={p.portfolioRef} hint="PDF, DOC, DOCX (max 20MB)" maxBytes={20 * 1024 * 1024} tooLargeMessage="Portfolio file must be under 20MB." />
            </>
          )}
          {key === "final" && (
            <>
              <TextField id="lower_range" label="Salary expectation (VND / month, gross)" optional type="number" value={form.lower_range} onChange={set("lower_range")} placeholder="e.g. 16000000" inputMode="numeric" />
              <TextAreaField id="cover_letter" label="Cover letter" required={senior} optional rows={4} value={form.cover_letter} onChange={set("cover_letter")} placeholder="Tell us why you're interested in this role and what makes you a great fit..." />
              <FileField id="cv_file" label="CV / resume" required file={p.cvFile} onFile={p.onCv} inputRef={p.cvRef} hint="PDF, DOC, DOCX (max 10MB)" maxBytes={10 * 1024 * 1024} tooLargeMessage="CV file must be under 10MB." />
              {level === "Standard" && (
                <FileField id="portfolio_file" label="Portfolio" optional file={p.portfolioFile} onFile={p.onPortfolio} inputRef={p.portfolioRef} hint="PDF, DOC, DOCX (max 20MB)" maxBytes={20 * 1024 * 1024} tooLargeMessage="Portfolio file must be under 20MB." />
              )}
            </>
          )}
        </section>

        {p.errorText && (
          <div ref={p.errorRef} role="alert" className="rounded-card border border-destructive/30 bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">
            {p.errorText}
          </div>
        )}

        <div className="flex gap-2.5 border-t pt-[22px]">
          {index > 0 && (
            <Button type="button" variant="outline" onClick={back} disabled={p.submitting} className="h-[52px] px-[26px] text-base">
              Back
            </Button>
          )}
          <span className="flex-1" />
          <Button key={last ? "submit" : `next-${index}`} type="submit" disabled={p.submitting} className="h-[52px] px-[26px] text-base">
            {p.submitting ? "Submitting..." : last ? "Submit application" : "Continue"}
          </Button>
        </div>
      </form>
    </DesktopFrame>
  );
}

function headingFor(key: DesktopStepKey): string {
  return key === "personal" ? "About you" : key === "background" ? "Your background" : key === "portfolio" ? "Portfolio" : "Salary, note & CV";
}
