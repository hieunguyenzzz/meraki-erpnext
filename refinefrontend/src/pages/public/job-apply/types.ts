export type Level = "Intern" | "Standard" | "Senior";

export interface FormValues {
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

export const INITIAL_FORM: FormValues = {
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

export type SetField = (field: keyof FormValues) => (value: string) => void;

/** Ignore a second tap this soon after the step changes (the same finger double-tapping a button). */
export const STEP_TAP_GUARD_MS = 400;
