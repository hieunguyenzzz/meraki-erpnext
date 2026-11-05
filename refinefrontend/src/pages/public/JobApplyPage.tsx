import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { ArrowLeft, ArrowRight, Briefcase, Clock, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeProvider } from "@/context/theme-context";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { type Job } from "@/lib/jobs";
import { FieldErrorContext } from "./job-apply/Field";
import { StepProgress } from "./job-apply/StepProgress";
import { DesktopApply } from "./job-apply/DesktopApply";
import { DesktopLoading, DesktopNotFound, DesktopSuccess } from "./job-apply/DesktopScreens";
import {
  BrandTitle,
  LoadingScreen,
  NotFoundScreen,
  PageFrame,
  SuccessScreen,
} from "./job-apply/Screens";
import {
  DocumentsSection,
  EducationSection,
  ExperienceSection,
  PersonalSection,
  ReviewSection,
} from "./job-apply/Sections";
import { INITIAL_FORM, STEP_TAP_GUARD_MS, type FormValues, type Level } from "./job-apply/types";

const STEP_LABELS = ["Details", "CV & letter", "Review"];
const TOTAL_STEPS = STEP_LABELS.length;

/** Which field a validation message belongs to, so it can be marked and focused. */
const ERROR_FIELDS: Array<[string, string]> = [
  ["Full name", "applicant_name"],
  ["Email", "email_id"],
  ["Phone", "phone_number"],
  ["Education degree", "education_degree"],
  ["Institution", "institution"],
  ["Graduation year", "graduation_year"],
  ["Work experience", "work_experience"],
  ["CV", "cv_file"],
  ["Portfolio", "portfolio_file"],
  ["Cover letter", "cover_letter"],
];

function fieldForError(message: string): string {
  return ERROR_FIELDS.find(([prefix]) => message.startsWith(prefix))?.[1] ?? "";
}

function JobApplyForm() {
  const [searchParams] = useSearchParams();
  const jobParam = searchParams.get("job") ?? "";
  // Desktop has its own stepped layout (D-JobApply); phones keep the mobile one.
  const desktop = useMediaQuery("(min-width: 768px)");

  const [job, setJob] = useState<Job | null>(null);
  const [loadingJob, setLoadingJob] = useState(true);
  const [jobNotFound, setJobNotFound] = useState(false);

  const [form, setForm] = useState<FormValues>(INITIAL_FORM);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [portfolioFile, setPortfolioFile] = useState<File | null>(null);
  const cvRef = useRef<HTMLInputElement>(null);
  const portfolioRef = useRef<HTMLInputElement>(null);

  // Multi-step: only used for Senior
  const [step, setStep] = useState(1);

  const [validationError, setValidationErrorState] = useState("");
  const [errorField, setErrorField] = useState("");
  // Bumped on every validation failure so the same message re-focuses/scrolls.
  const [errorTick, setErrorTick] = useState(0);
  const stepChangedAt = useRef(0);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "Apply | Meraki Wedding Planner";
    if (!jobParam) {
      setJobNotFound(true);
      setLoadingJob(false);
      return;
    }
    fetch("/inquiry-api/jobs")
      .then((r) => r.json())
      .then((d) => {
        const all: Job[] = d.data ?? [];
        const found = all.find((j) => j.name === jobParam);
        if (found) {
          setJob(found);
        } else {
          setJobNotFound(true);
        }
      })
      .catch((e) => {
        console.error("job_apply: failed to load job openings", e);
        setJobNotFound(true);
      })
      .finally(() => setLoadingJob(false));
  }, [jobParam]);

  function setValidationError(message: string) {
    setValidationErrorState(message);
    setErrorField(message ? fieldForError(message) : "");
    if (message) setErrorTick((t) => t + 1);
  }

  // Bring the error into view: focus the offending field if it is on screen, else the banner.
  useEffect(() => {
    if (!errorTick) return;
    const field = errorField ? document.getElementById(errorField) : null;
    if (field) field.focus();
    else errorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [errorTick, errorField]);

  useEffect(() => {
    if (submitError) errorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [submitError]);

  // New step starts at the top.
  const firstStepRender = useRef(true);
  useEffect(() => {
    if (firstStepRender.current) {
      firstStepRender.current = false;
      return;
    }
    stepChangedAt.current = Date.now();
    window.scrollTo({ top: 0 });
  }, [step]);

  function set(field: keyof FormValues) {
    return (value: string) => {
      setValidationError("");
      setForm((f) => ({ ...f, [field]: value }));
    };
  }

  const level: Level = (job?.custom_application_level as Level) ?? "Standard";
  const isSenior = level === "Senior";
  const isStandard = level === "Standard";
  const showEducation = isStandard || isSenior;

  // ─── Validation per step ────────────────────────────────────────────────────

  function validateStep(s: number): string {
    if (s === 1 || !isSenior) {
      if (!form.applicant_name.trim()) return "Full name is required.";
      if (!form.email_id.trim()) return "Email is required.";
      if (!form.phone_number.trim()) return "Phone number is required.";
      if (isSenior) {
        if (!form.education_degree.trim()) return "Education degree is required.";
        if (!form.institution.trim()) return "Institution is required.";
        if (!form.graduation_year.trim()) return "Graduation year is required.";
        if (!form.work_experience.trim()) return "Work experience is required.";
      }
    }
    if ((s === 2 && isSenior) || !isSenior) {
      if (!cvFile) return "CV upload is required.";
      if (isSenior && !portfolioFile)
        return "Portfolio upload is required for Senior applicants.";
      if (isSenior && !form.cover_letter.trim())
        return "Cover letter is required for Senior applicants.";
    }
    return "";
  }

  function validateFinalSubmit(): string {
    // Check all required fields
    if (!form.applicant_name.trim()) return "Full name is required.";
    if (!form.email_id.trim()) return "Email is required.";
    if (!form.phone_number.trim()) return "Phone number is required.";
    if (isSenior) {
      if (!form.education_degree.trim()) return "Education degree is required.";
      if (!form.institution.trim()) return "Institution is required.";
      if (!form.graduation_year.trim()) return "Graduation year is required.";
      if (!form.work_experience.trim()) return "Work experience is required.";
    }
    if (!cvFile) return "CV upload is required.";
    if (cvFile.size > 10 * 1024 * 1024) return "CV file must be under 10MB.";
    if (portfolioFile && portfolioFile.size > 20 * 1024 * 1024)
      return "Portfolio file must be under 20MB.";
    if (level !== "Intern" && isSenior && !portfolioFile)
      return "Portfolio upload is required for Senior applicants.";
    if (isSenior && !form.cover_letter.trim())
      return "Cover letter is required for Senior applicants.";
    return "";
  }

  // ─── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (submittingRef.current) return;
    const err = validateFinalSubmit();
    if (err) {
      setValidationError(err);
      return;
    }
    submittingRef.current = true;
    setValidationError("");
    setSubmitError("");
    setSubmitting(true);

    try {
      const fd = new FormData();
      fd.append("applicant_name", form.applicant_name.trim());
      fd.append("email_id", form.email_id.trim());
      fd.append("phone_number", form.phone_number.trim());
      fd.append("job_title", jobParam);
      if (form.custom_city.trim()) fd.append("custom_city", form.custom_city.trim());
      if (form.education_degree.trim())
        fd.append("custom_education_degree", form.education_degree.trim());
      if (form.institution.trim()) fd.append("custom_education_institution", form.institution.trim());
      if (form.graduation_year.trim())
        fd.append("custom_education_graduation_year", form.graduation_year.trim());
      if (form.work_experience.trim())
        fd.append("custom_work_experience", form.work_experience.trim());
      if (form.lower_range.trim()) fd.append("lower_range", form.lower_range.trim());
      if (form.custom_linkedin_url.trim())
        fd.append("custom_linkedin_url", form.custom_linkedin_url.trim());
      if (form.cover_letter.trim()) fd.append("cover_letter", form.cover_letter.trim());
      fd.append("cv_file", cvFile!);
      if (portfolioFile) fd.append("portfolio_file", portfolioFile);

      const res = await fetch("/inquiry-api/jobs/apply", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
      } else {
        console.error("job_apply: submission rejected", res.status, data);
        setSubmitError(data.detail || "Submission failed. Please try again.");
      }
    } catch (e) {
      console.error("job_apply: submission failed", e);
      setSubmitError("Network error. Please try again.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  // ─── Senior step navigation ──────────────────────────────────────────────────

  function handleNextStep() {
    const err = validateStep(step);
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError("");
    if (step < TOTAL_STEPS) setStep(step + 1);
  }

  function handleBack() {
    setValidationError("");
    setSubmitError("");
    setStep(step - 1);
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (Date.now() - stepChangedAt.current < STEP_TAP_GUARD_MS) return;
    if (isSenior && step < TOTAL_STEPS) handleNextStep();
    else handleSubmit();
  }

  // ─── Render loading/error/success ───────────────────────────────────────────

  if (loadingJob) return desktop ? <DesktopLoading /> : <LoadingScreen />;
  if (jobNotFound || !job) return desktop ? <DesktopNotFound /> : <NotFoundScreen />;
  if (submitted) {
    return desktop ? (
      <DesktopSuccess jobTitle={job.job_title} name={form.applicant_name} />
    ) : (
      <SuccessScreen jobTitle={job.job_title} />
    );
  }

  const documents = (
    <DocumentsSection
      form={form}
      set={set}
      isSenior={isSenior}
      showPortfolio={showEducation}
      cvFile={cvFile}
      portfolioFile={portfolioFile}
      onCv={(f) => {
        setValidationError("");
        setCvFile(f);
      }}
      onPortfolio={(f) => {
        setValidationError("");
        setPortfolioFile(f);
      }}
      cvRef={cvRef}
      portfolioRef={portfolioRef}
    />
  );

  const errorText = validationError || submitError;

  if (desktop) {
    return (
      <FieldErrorContext.Provider
        value={errorField && validationError ? { id: errorField, message: validationError } : null}
      >
        <DesktopApply
          job={job}
          level={level}
          form={form}
          set={set}
          cvFile={cvFile}
          portfolioFile={portfolioFile}
          onCv={(f) => {
            setValidationError("");
            setCvFile(f);
          }}
          onPortfolio={(f) => {
            setValidationError("");
            setPortfolioFile(f);
          }}
          cvRef={cvRef}
          portfolioRef={portfolioRef}
          errorText={errorText}
          errorRef={errorRef}
          setValidationError={setValidationError}
          clearSubmitError={() => setSubmitError("")}
          submitting={submitting}
          onSubmit={handleSubmit}
        />
      </FieldErrorContext.Provider>
    );
  }

  return (
    <PageFrame>
      <header className="flex flex-col gap-3 px-6 pt-5">
        <BrandTitle />
        <div className="rounded-card border bg-card px-3.5 py-3">
          <div className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-accent-foreground">
            <Briefcase aria-hidden="true" className="h-3.5 w-3.5" />
            {job.custom_application_level || "Standard"} role
          </div>
          <h1 className="text-base font-bold leading-snug">{job.job_title}</h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
            {job.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
                {job.location}
              </span>
            )}
            {job.closes_on && (
              <span className="inline-flex items-center gap-1">
                <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                Closes {job.closes_on}
              </span>
            )}
          </div>
        </div>
        {isSenior && <StepProgress step={step} labels={STEP_LABELS} />}
      </header>

      <FieldErrorContext.Provider
        value={errorField && validationError ? { id: errorField, message: validationError } : null}
      >
      <form onSubmit={handleFormSubmit} noValidate className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-8 px-6 py-6">
          {/* Single-page: Intern (personal + documents), Standard (+ education) */}
          {!isSenior && (
            <>
              <PersonalSection form={form} set={set} />
              {isStandard && <EducationSection form={form} set={set} isSenior={false} />}
              {documents}
            </>
          )}

          {/* Multi-step: Senior */}
          {isSenior && step === 1 && (
            <>
              <PersonalSection form={form} set={set} />
              <EducationSection form={form} set={set} isSenior />
              <ExperienceSection form={form} set={set} isSenior />
            </>
          )}
          {isSenior && step === 2 && documents}
          {isSenior && step === 3 && (
            <ReviewSection form={form} cvFile={cvFile} portfolioFile={portfolioFile} />
          )}

          {errorText && (
            <div
              ref={errorRef}
              role="alert"
              className="rounded-card border border-destructive/30 bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground"
            >
              {errorText}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex gap-2.5 border-t bg-card px-6 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {isSenior && step > 1 && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={handleBack}
              disabled={submitting}
              className="px-5"
            >
              <ArrowLeft aria-hidden="true" />
              Back
            </Button>
          )}
          {isSenior && step < TOTAL_STEPS ? (
            <Button key={`next-${step}`} type="submit" size="lg" className="flex-1">
              {step === TOTAL_STEPS - 1 ? "Review application" : "Continue"}
              <ArrowRight aria-hidden="true" />
            </Button>
          ) : (
            <Button key="submit" type="submit" size="lg" className="flex-1" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit application"}
            </Button>
          )}
        </div>
      </form>
      </FieldErrorContext.Provider>
    </PageFrame>
  );
}

export default function JobApplyPage() {
  return (
    <ThemeProvider>
      <JobApplyForm />
    </ThemeProvider>
  );
}
