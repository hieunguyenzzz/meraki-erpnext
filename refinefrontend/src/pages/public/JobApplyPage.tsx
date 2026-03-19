import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { Upload, ArrowLeft, ArrowRight, Check, Briefcase, MapPin, Clock } from "lucide-react";
import { type Job, formatClosesOn } from "@/lib/jobs";

type Level = "Intern" | "Standard" | "Senior";

interface FormValues {
  applicant_name: string;
  email_id: string;
  phone_number: string;
  custom_city: string;
  // Education (Standard + Senior)
  education_degree: string;
  institution: string;
  graduation_year: string;
  // Senior only
  work_experience: string;
  lower_range: string;
  custom_linkedin_url: string;
  cover_letter: string;
}

const INITIAL_FORM: FormValues = {
  applicant_name: "",
  email_id: "",
  phone_number: "",
  custom_city: "",
  education_degree: "",
  institution: "",
  graduation_year: "",
  work_experience: "",
  lower_range: "",
  custom_linkedin_url: "",
  cover_letter: "",
};


// ─── Styled sub-components ──────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-stone-700 mb-1">
      {children}
      {required && <span className="text-amber-700 ml-1">*</span>}
    </label>
  );
}

function StyledInput({
  id,
  type = "text",
  value,
  onChange,
  placeholder,
  required,
  disabled,
}: {
  id?: string;
  type?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      className="w-full rounded-lg border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-700/30 focus:border-amber-700 transition-colors disabled:opacity-50"
    />
  );
}

function StyledTextarea({
  id,
  value,
  onChange,
  placeholder,
  rows = 4,
  required,
}: {
  id?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  required?: boolean;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      required={required}
      className="w-full rounded-lg border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-700/30 focus:border-amber-700 transition-colors resize-none"
    />
  );
}

function FileDropZone({
  label,
  file,
  onFile,
  accept = ".pdf,.doc,.docx",
  hint = "PDF, DOC, DOCX (max 10MB)",
  required,
  inputRef,
}: {
  label: string;
  file: File | null;
  onFile: (f: File) => void;
  accept?: string;
  hint?: string;
  required?: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }

  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      <div
        className={`border-2 border-dashed rounded-xl p-7 text-center cursor-pointer transition-colors ${
          dragging
            ? "border-amber-600 bg-amber-50"
            : file
            ? "border-green-400 bg-green-50/50"
            : "border-amber-200 hover:border-amber-400 hover:bg-amber-50/50"
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {file ? (
          <>
            <Check className="h-7 w-7 mx-auto text-green-600 mb-2" />
            <p className="text-sm font-medium text-green-700">{file.name}</p>
            <p className="text-xs text-stone-400 mt-1">Click to replace</p>
          </>
        ) : (
          <>
            <Upload className="h-7 w-7 mx-auto text-amber-400 mb-2" />
            <p className="text-sm text-stone-600">
              Click to upload or drag &amp; drop
            </p>
            <p className="text-xs text-stone-400 mt-1">{hint}</p>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </div>
  );
}

// ─── Step progress indicator ─────────────────────────────────────────────────

function StepIndicator({ step, total }: { step: number; total: number }) {
  const labels = ["Personal & Background", "Documents", "Review & Submit"];
  return (
    <div className="flex items-center gap-0 mb-8">
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <div key={n} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  done
                    ? "bg-amber-700 text-white"
                    : active
                    ? "bg-amber-800 text-white ring-4 ring-amber-200"
                    : "bg-stone-200 text-stone-500"
                }`}
              >
                {done ? <Check className="h-4 w-4" /> : n}
              </div>
              <span
                className={`mt-1 text-xs whitespace-nowrap ${
                  active ? "text-amber-800 font-medium" : "text-stone-400"
                }`}
              >
                {labels[i]}
              </span>
            </div>
            {n < total && (
              <div
                className={`flex-1 h-0.5 mx-2 mt-[-1.1rem] ${
                  done ? "bg-amber-700" : "bg-stone-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Success screen ──────────────────────────────────────────────────────────

function SuccessScreen({ jobTitle }: { jobTitle: string }) {
  return (
    <div className="max-w-md mx-auto text-center py-16 px-4">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mb-6">
        <Check className="h-9 w-9 text-green-600" />
      </div>
      <h2 className="font-serif text-3xl font-bold text-stone-800 mb-3">
        Application Received!
      </h2>
      <p className="text-stone-500 leading-relaxed mb-2">
        Thank you for applying for{" "}
        <span className="font-medium text-stone-700">{jobTitle}</span>.
      </p>
      <p className="text-stone-500 text-sm mb-8">
        We'll review your application and be in touch soon.
      </p>
      <p className="text-stone-400 text-sm mt-2">You may now close this page.</p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function JobApplyPage() {
  const [searchParams] = useSearchParams();
  const jobParam = searchParams.get("job") ?? "";

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
  const TOTAL_STEPS = 3;

  const [validationError, setValidationError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);

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
      .catch(() => setJobNotFound(true))
      .finally(() => setLoadingJob(false));
  }, [jobParam]);

  function set(field: keyof FormValues) {
    return (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => setForm((f) => ({ ...f, [field]: e.target.value }));
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
    const err = validateFinalSubmit();
    if (err) {
      setValidationError(err);
      return;
    }
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
        setSubmitError(data.detail || "Submission failed. Please try again.");
      }
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
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

  // ─── Render loading/error ───────────────────────────────────────────────────

  if (loadingJob) {
    return (
      <div
        style={{ backgroundColor: "#FAF8F5", minHeight: "100vh" }}
        className="flex items-center justify-center"
      >
        <div className="text-stone-400 text-sm animate-pulse">Loading position...</div>
      </div>
    );
  }

  if (jobNotFound || !job) {
    return (
      <div
        style={{ backgroundColor: "#FAF8F5", minHeight: "100vh" }}
        className="flex flex-col items-center justify-center gap-4 px-4"
      >
        <Briefcase className="h-12 w-12 text-stone-300" />
        <h2 className="font-serif text-2xl font-bold text-stone-700">
          Position not found
        </h2>
        <p className="text-stone-400 text-sm">
          This job opening may have been closed or removed.
        </p>
        <p className="mt-2 text-stone-400 text-sm">Please contact us if you believe this is an error.</p>
      </div>
    );
  }

  // ─── Success ─────────────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div style={{ backgroundColor: "#FAF8F5", minHeight: "100vh" }}>
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-stone-100">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center">
            <span className="font-serif text-lg font-bold text-stone-800 tracking-wide">
              Meraki
            </span>
          </div>
        </header>
        <SuccessScreen jobTitle={job.job_title} />
      </div>
    );
  }

  // ─── Sections ────────────────────────────────────────────────────────────────

  function PersonalSection() {
    return (
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-stone-700 border-b border-stone-100 pb-2">
          Personal Information
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel required>Full Name</FieldLabel>
            <StyledInput
              value={form.applicant_name}
              onChange={set("applicant_name")}
              placeholder="Your full name"
              required
            />
          </div>
          <div>
            <FieldLabel required>Email Address</FieldLabel>
            <StyledInput
              type="email"
              value={form.email_id}
              onChange={set("email_id")}
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <FieldLabel required>Phone Number</FieldLabel>
            <StyledInput
              type="tel"
              value={form.phone_number}
              onChange={set("phone_number")}
              placeholder="+84 ..."
              required
            />
          </div>
          <div>
            <FieldLabel>City</FieldLabel>
            <StyledInput
              value={form.custom_city}
              onChange={set("custom_city")}
              placeholder="e.g. Ho Chi Minh City"
            />
          </div>
        </div>
      </div>
    );
  }

  function EducationSection() {
    return (
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-stone-700 border-b border-stone-100 pb-2">
          Education
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel required={isSenior}>Degree / Qualification</FieldLabel>
            <StyledInput
              value={form.education_degree}
              onChange={set("education_degree")}
              placeholder="e.g. Bachelor of Arts"
              required={isSenior}
            />
          </div>
          <div>
            <FieldLabel required={isSenior}>Institution</FieldLabel>
            <StyledInput
              value={form.institution}
              onChange={set("institution")}
              placeholder="University or college name"
              required={isSenior}
            />
          </div>
          <div>
            <FieldLabel required={isSenior}>Graduation Year</FieldLabel>
            <StyledInput
              value={form.graduation_year}
              onChange={set("graduation_year")}
              placeholder="e.g. 2021"
              required={isSenior}
            />
          </div>
        </div>
      </div>
    );
  }

  function SeniorExtraSection() {
    return (
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-stone-700 border-b border-stone-100 pb-2">
          Experience
        </h3>
        <div>
          <FieldLabel required={isSenior}>Work Experience</FieldLabel>
          <StyledTextarea
            value={form.work_experience}
            onChange={set("work_experience")}
            placeholder="Describe your relevant experience, roles held, key achievements..."
            rows={5}
            required={isSenior}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel>Expected Monthly Salary (USD)</FieldLabel>
            <StyledInput
              type="number"
              value={form.lower_range}
              onChange={set("lower_range")}
              placeholder="e.g. 1500"
            />
          </div>
          <div>
            <FieldLabel>LinkedIn Profile URL</FieldLabel>
            <StyledInput
              type="url"
              value={form.custom_linkedin_url}
              onChange={set("custom_linkedin_url")}
              placeholder="https://linkedin.com/in/..."
            />
          </div>
        </div>
      </div>
    );
  }

  function DocumentsSection() {
    return (
      <div className="space-y-5">
        <h3 className="text-base font-semibold text-stone-700 border-b border-stone-100 pb-2">
          Documents
        </h3>
        <FileDropZone
          label="CV / Resume"
          file={cvFile}
          onFile={setCvFile}
          inputRef={cvRef}
          required
          hint="PDF, DOC, DOCX (max 10MB)"
        />
        {(isStandard || isSenior) && (
          <FileDropZone
            label={`Portfolio${isSenior ? "" : " (optional)"}`}
            file={portfolioFile}
            onFile={setPortfolioFile}
            inputRef={portfolioRef}
            required={isSenior}
            hint="PDF, DOC, DOCX, ZIP (max 20MB)"
            accept=".pdf,.doc,.docx,.zip"
          />
        )}
        <div>
          <FieldLabel required={isSenior}>
            Cover Letter{!isSenior ? " (optional)" : ""}
          </FieldLabel>
          <StyledTextarea
            value={form.cover_letter}
            onChange={set("cover_letter")}
            placeholder="Tell us why you're interested in this role and what makes you a great fit..."
            rows={5}
            required={isSenior}
          />
        </div>
      </div>
    );
  }

  function ReviewSection() {
    return (
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-stone-700 border-b border-stone-100 pb-2">
          Review Your Application
        </h3>
        <dl className="space-y-3 text-sm">
          <div className="flex gap-3">
            <dt className="w-40 text-stone-400 shrink-0">Name</dt>
            <dd className="text-stone-700 font-medium">{form.applicant_name}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-40 text-stone-400 shrink-0">Email</dt>
            <dd className="text-stone-700">{form.email_id}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-40 text-stone-400 shrink-0">Phone</dt>
            <dd className="text-stone-700">{form.phone_number}</dd>
          </div>
          {form.custom_city && (
            <div className="flex gap-3">
              <dt className="w-40 text-stone-400 shrink-0">City</dt>
              <dd className="text-stone-700">{form.custom_city}</dd>
            </div>
          )}
          {form.education_degree && (
            <div className="flex gap-3">
              <dt className="w-40 text-stone-400 shrink-0">Education</dt>
              <dd className="text-stone-700">
                {form.education_degree}
                {form.institution ? `, ${form.institution}` : ""}
                {form.graduation_year ? ` (${form.graduation_year})` : ""}
              </dd>
            </div>
          )}
          {form.lower_range && (
            <div className="flex gap-3">
              <dt className="w-40 text-stone-400 shrink-0">Expected Salary</dt>
              <dd className="text-stone-700">${form.lower_range}/mo</dd>
            </div>
          )}
          {cvFile && (
            <div className="flex gap-3">
              <dt className="w-40 text-stone-400 shrink-0">CV</dt>
              <dd className="text-stone-700">{cvFile.name}</dd>
            </div>
          )}
          {portfolioFile && (
            <div className="flex gap-3">
              <dt className="w-40 text-stone-400 shrink-0">Portfolio</dt>
              <dd className="text-stone-700">{portfolioFile.name}</dd>
            </div>
          )}
        </dl>
        <p className="text-xs text-stone-400 mt-2">
          By submitting, you confirm all information is accurate to the best of
          your knowledge.
        </p>
      </div>
    );
  }

  // ─── Render: single-page (Intern/Standard) or multi-step (Senior) ───────────

  return (
    <div style={{ backgroundColor: "#FAF8F5", minHeight: "100vh" }}>
      {/* Nav */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-stone-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="w-24" />
          <span className="font-serif text-lg font-bold text-stone-800 tracking-wide">
            Meraki
          </span>
          <div className="w-24" />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        {/* Job header */}
        <div className="mb-8 pb-6 border-b border-stone-200">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-100 px-3 py-1 text-xs font-medium text-amber-700 mb-3">
            <Briefcase className="h-3.5 w-3.5" />
            {job.custom_application_level || "Standard"} role
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-stone-800 mb-3">
            {job.job_title}
          </h1>
          <div className="flex flex-wrap gap-4 text-sm text-stone-400">
            {job.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {job.location}
              </span>
            )}
            {job.closes_on && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Closes {formatClosesOn(job.closes_on)}
              </span>
            )}
          </div>
        </div>

        {/* Form card */}
        <div className="rounded-2xl bg-white border border-stone-100 shadow-sm p-6 sm:p-8">
          {isSenior && (
            <StepIndicator step={step} total={TOTAL_STEPS} />
          )}

          {/* Single-page form: Intern */}
          {!isSenior && !isStandard && (
            <div className="space-y-8">
              {PersonalSection()}
              {DocumentsSection()}
            </div>
          )}

          {/* Single-page form: Standard — Education before Documents */}
          {isStandard && (
            <div className="space-y-8">
              {PersonalSection()}
              {EducationSection()}
              {DocumentsSection()}
            </div>
          )}

          {/* Multi-step: Senior */}
          {isSenior && step === 1 && (
            <div className="space-y-8">
              {PersonalSection()}
              {EducationSection()}
              {SeniorExtraSection()}
            </div>
          )}
          {isSenior && step === 2 && (
            <div className="space-y-8">
              {DocumentsSection()}
            </div>
          )}
          {isSenior && step === 3 && ReviewSection()}

          {/* Errors */}
          {validationError && (
            <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
              {validationError}
            </p>
          )}
          {submitError && (
            <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
              {submitError}
            </p>
          )}

          {/* Actions */}
          <div className="mt-8 flex items-center justify-between gap-3">
            {isSenior && step > 1 ? (
              <button
                type="button"
                onClick={() => {
                  setValidationError("");
                  setStep(step - 1);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-sm font-medium px-5 py-2.5 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            ) : (
              <div />
            )}

            {isSenior && step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="inline-flex items-center gap-2 rounded-full bg-amber-800 hover:bg-amber-900 text-white text-sm font-medium px-6 py-2.5 transition-colors"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-full bg-amber-800 hover:bg-amber-900 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium px-6 py-2.5 transition-colors"
              >
                {submitting ? "Submitting..." : "Submit Application"}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
