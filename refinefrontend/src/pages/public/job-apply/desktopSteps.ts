import type { FormValues, Level } from "./types";

export type DesktopStepKey = "personal" | "background" | "portfolio" | "final";

export const STEP_NAMES: Record<DesktopStepKey, string> = {
  personal: "Personal details",
  background: "Background",
  portfolio: "Portfolio",
  final: "Salary & CV",
};

/** Desktop steps for a level: everyone gets three; Senior adds a portfolio step before the last. */
export function stepsFor(level: Level): DesktopStepKey[] {
  return level === "Senior"
    ? ["personal", "background", "portfolio", "final"]
    : ["personal", "background", "final"];
}

/** First validation message for one desktop step ("" when it passes). Wording matches the mobile form. */
export function validateDesktopStep(
  key: DesktopStepKey,
  level: Level,
  form: FormValues,
  cvFile: File | null,
  portfolioFile: File | null
): string {
  const senior = level === "Senior";
  if (key === "personal") {
    if (!form.applicant_name.trim()) return "Full name is required.";
    if (!form.email_id.trim()) return "Email is required.";
    if (!form.phone_number.trim()) return "Phone number is required.";
  }
  if (key === "background" && senior) {
    if (!form.education_degree.trim()) return "Education degree is required.";
    if (!form.institution.trim()) return "Institution is required.";
    if (!form.graduation_year.trim()) return "Graduation year is required.";
    if (!form.work_experience.trim()) return "Work experience is required.";
  }
  if (key === "portfolio" && senior && !portfolioFile) {
    return "Portfolio upload is required for Senior applicants.";
  }
  if (key === "final") {
    if (!cvFile) return "CV upload is required.";
    if (senior && !form.cover_letter.trim()) return "Cover letter is required for Senior applicants.";
  }
  return "";
}
