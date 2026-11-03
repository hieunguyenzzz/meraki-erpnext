import type { ReactNode } from "react";
import { TextField, TextAreaField } from "./Field";
import { FileField } from "./FileField";
import type { FormValues, SetField } from "./types";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-[22px] font-semibold leading-tight">{title}</h2>
      {children}
    </section>
  );
}

interface FormProps {
  form: FormValues;
  set: SetField;
}

export function PersonalSection({ form, set }: FormProps) {
  return (
    <Section title="Your details">
      <TextField
        id="applicant_name"
        label="Full name"
        required
        value={form.applicant_name}
        onChange={set("applicant_name")}
        placeholder="Your full name"
        autoComplete="name"
      />
      <TextField
        id="email_id"
        label="Email address"
        required
        type="email"
        value={form.email_id}
        onChange={set("email_id")}
        placeholder="you@example.com"
        autoComplete="email"
        inputMode="email"
      />
      <TextField
        id="phone_number"
        label="Phone number"
        required
        type="tel"
        value={form.phone_number}
        onChange={set("phone_number")}
        placeholder="+84 ..."
        autoComplete="tel"
      />
      <TextField
        id="custom_city"
        label="City"
        optional
        value={form.custom_city}
        onChange={set("custom_city")}
        placeholder="e.g. Ho Chi Minh City"
        autoComplete="address-level2"
      />
    </Section>
  );
}

export function EducationSection({ form, set, isSenior }: FormProps & { isSenior: boolean }) {
  return (
    <Section title="Education">
      <TextField
        id="education_degree"
        label="Degree / qualification"
        required={isSenior}
        optional
        value={form.education_degree}
        onChange={set("education_degree")}
        placeholder="e.g. Bachelor of Arts"
      />
      <TextField
        id="institution"
        label="Institution"
        required={isSenior}
        optional
        value={form.institution}
        onChange={set("institution")}
        placeholder="University or college name"
      />
      <TextField
        id="graduation_year"
        label="Graduation year"
        required={isSenior}
        optional
        value={form.graduation_year}
        onChange={set("graduation_year")}
        placeholder="e.g. 2021"
        inputMode="numeric"
      />
    </Section>
  );
}

export function ExperienceSection({ form, set, isSenior }: FormProps & { isSenior: boolean }) {
  return (
    <Section title="Experience">
      <TextAreaField
        id="work_experience"
        label="Work experience"
        required={isSenior}
        value={form.work_experience}
        onChange={set("work_experience")}
        placeholder="Describe your relevant experience, roles held, key achievements..."
      />
      <TextField
        id="lower_range"
        label="Expected monthly salary (USD)"
        optional
        type="number"
        value={form.lower_range}
        onChange={set("lower_range")}
        placeholder="e.g. 1500"
        inputMode="numeric"
      />
      <TextField
        id="custom_linkedin_url"
        label="LinkedIn profile URL"
        optional
        type="url"
        value={form.custom_linkedin_url}
        onChange={set("custom_linkedin_url")}
        placeholder="https://linkedin.com/in/..."
        inputMode="url"
      />
    </Section>
  );
}

interface DocumentsProps extends FormProps {
  isSenior: boolean;
  showPortfolio: boolean;
  cvFile: File | null;
  portfolioFile: File | null;
  onCv: (f: File) => void;
  onPortfolio: (f: File) => void;
  cvRef: React.RefObject<HTMLInputElement | null>;
  portfolioRef: React.RefObject<HTMLInputElement | null>;
}

export function DocumentsSection({
  form,
  set,
  isSenior,
  showPortfolio,
  cvFile,
  portfolioFile,
  onCv,
  onPortfolio,
  cvRef,
  portfolioRef,
}: DocumentsProps) {
  return (
    <Section title="Your CV and cover letter">
      <FileField
        id="cv_file"
        label="CV / resume"
        required
        file={cvFile}
        onFile={onCv}
        inputRef={cvRef}
        hint="PDF, DOC, DOCX (max 10MB)"
        maxBytes={10 * 1024 * 1024}
        tooLargeMessage="CV file must be under 10MB."
      />
      {showPortfolio && (
        <FileField
          id="portfolio_file"
          label="Portfolio"
          required={isSenior}
          optional
          file={portfolioFile}
          onFile={onPortfolio}
          inputRef={portfolioRef}
          hint="PDF, DOC, DOCX (max 20MB)"
          accept=".pdf,.doc,.docx"
          maxBytes={20 * 1024 * 1024}
          tooLargeMessage="Portfolio file must be under 20MB."
        />
      )}
      <TextAreaField
        id="cover_letter"
        label="Cover letter"
        required={isSenior}
        optional
        value={form.cover_letter}
        onChange={set("cover_letter")}
        placeholder="Tell us why you're interested in this role and what makes you a great fit..."
      />
    </Section>
  );
}

interface ReviewProps {
  form: FormValues;
  cvFile: File | null;
  portfolioFile: File | null;
}

export function ReviewSection({ form, cvFile, portfolioFile }: ReviewProps) {
  const rows: Array<[string, string]> = [["Name", form.applicant_name], ["Email", form.email_id], ["Phone", form.phone_number]];
  if (form.custom_city) rows.push(["City", form.custom_city]);
  if (form.education_degree) {
    rows.push([
      "Education",
      `${form.education_degree}${form.institution ? `, ${form.institution}` : ""}${
        form.graduation_year ? ` (${form.graduation_year})` : ""
      }`,
    ]);
  }
  if (form.lower_range) rows.push(["Expected salary", `USD ${form.lower_range}/mo`]);
  if (cvFile) rows.push(["CV", cvFile.name]);
  if (portfolioFile) rows.push(["Portfolio", portfolioFile.name]);

  return (
    <Section title="Review your application">
      <dl className="divide-y rounded-card border bg-card text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3 px-4 py-3">
            <dt className="w-28 shrink-0 text-muted-foreground">{k}</dt>
            <dd className="min-w-0 break-words font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        By submitting, you confirm all information is accurate to the best of your knowledge.
      </p>
    </Section>
  );
}
