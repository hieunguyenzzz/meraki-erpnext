// Field names are the exact keys the /inquiry-api/inquiry endpoint expects. Do not rename.
export interface InquiryFormData {
  couple_names: string;
  preferred_name: string;
  nationalities: string;
  bride_email: string;
  groom_email: string;
  phone: string;
  wedding_date: string;
  location: string;
  location_reason: string;
  guest_count: string;
  out_of_town_guests: string;
  three_words: string;
  must_haves: string;
  pinterest: string;
  budget: string;
  referral_source: string;
  personal_story: string;
}

export type FieldName = keyof InquiryFormData;

export const INITIAL_FORM: InquiryFormData = {
  couple_names: "", preferred_name: "", nationalities: "",
  bride_email: "", groom_email: "", phone: "",
  wedding_date: "", location: "", location_reason: "",
  guest_count: "", out_of_town_guests: "",
  three_words: "", must_haves: "", pinterest: "",
  budget: "", referral_source: "", personal_story: "",
};

export const REFERRAL_OPTIONS = ["Facebook", "Instagram", "A dear friend", "Website", "Other"];
export const BUDGET_OPTIONS = [
  "Under $10,000", "$10,000 – $20,000", "$20,000 – $35,000",
  "$35,000 – $50,000", "Above $50,000",
];

export const REQUIRED_FIELDS: FieldName[] = [
  "couple_names", "preferred_name", "nationalities",
  "bride_email", "groom_email", "phone",
  "wedding_date", "location", "location_reason",
  "three_words", "budget", "referral_source",
];

export interface StepDef {
  title: string; // stepper label and section name
  heading: string; // page heading
  fields: FieldName[];
}

export const STEPS: StepDef[] = [
  {
    title: "About You Two",
    heading: "Tell us about you two",
    fields: ["couple_names", "preferred_name", "nationalities", "bride_email", "groom_email", "phone"],
  },
  {
    title: "Your Wedding Day",
    heading: "Tell us about the day",
    fields: ["wedding_date", "location", "location_reason", "guest_count", "out_of_town_guests"],
  },
  {
    title: "Your Vision",
    heading: "What feels like you?",
    fields: ["three_words", "must_haves", "pinterest", "budget"],
  },
  {
    title: "Getting to Know You",
    heading: "Nearly there",
    fields: ["referral_source", "personal_story"],
  },
];

export function isRequired(f: FieldName): boolean {
  return REQUIRED_FIELDS.includes(f);
}

export function isMissing(form: InquiryFormData, f: FieldName): boolean {
  return isRequired(f) && !form[f].trim();
}
