import { ChoiceGroup, TextAreaField, TextField } from "./fields";
import { BUDGET_OPTIONS, REFERRAL_OPTIONS, type FieldName, type InquiryFormData } from "./types";

interface StepFieldsProps {
  step: number;
  form: InquiryFormData;
  errors: Partial<Record<FieldName, string>>;
  onChange: (field: FieldName, value: string) => void;
}

/** The fields of one step. Labels, placeholders and required flags are unchanged from the original form. */
export function StepFields({ step, form, errors, onChange }: StepFieldsProps) {
  const t = (f: FieldName) => ({
    id: f,
    value: form[f],
    onChange: (v: string) => onChange(f, v),
    error: errors[f],
  });

  if (step === 0) {
    return (
      <>
        <TextField {...t("couple_names")} label="Couple names" placeholder="e.g. Sophie & James" required autoComplete="off" />
        <TextField {...t("preferred_name")} label="How should we address you?" placeholder="Your preferred first name" required autoComplete="given-name" />
        <TextField {...t("nationalities")} label="Nationalities" placeholder="e.g. Australian & Vietnamese" required autoComplete="off" />
        <div className="grid gap-5 md:grid-cols-2">
          <TextField {...t("bride_email")} label="Bride's email" type="email" inputMode="email" placeholder="bride@example.com" required autoComplete="email" />
          <TextField {...t("groom_email")} label="Groom's email" type="email" inputMode="email" placeholder="groom@example.com" required autoComplete="off" />
        </div>
        <TextField {...t("phone")} label="Phone number" type="tel" inputMode="tel" placeholder="Include country code" required autoComplete="tel" />
      </>
    );
  }

  if (step === 1) {
    return (
      <>
        <div className="grid gap-5 md:grid-cols-2">
          <TextField {...t("wedding_date")} label="Wedding date" type="date" required />
          <TextField {...t("location")} label="Location / city" placeholder="e.g. Hoi An, Vietnam" required autoComplete="off" />
        </div>
        <TextAreaField {...t("location_reason")} label="Why this location?" placeholder="What draws you to this place?" required />
        <div className="grid gap-5 md:grid-cols-2">
          <TextField {...t("guest_count")} label="Estimated guest count" placeholder="e.g. 80" inputMode="numeric" autoComplete="off" />
          <TextField {...t("out_of_town_guests")} label="Out-of-town guests" placeholder="e.g. 30 from Australia" autoComplete="off" />
        </div>
      </>
    );
  }

  if (step === 2) {
    return (
      <>
        <TextField {...t("three_words")} label="Describe your day in 3 words" placeholder="e.g. Intimate, Romantic, Timeless" required autoComplete="off" />
        <TextAreaField {...t("must_haves")} label="Must-haves for your wedding" placeholder="Flowers, music, moments — what is non-negotiable?" />
        <TextField {...t("pinterest")} label="Pinterest or inspiration board link" type="url" inputMode="url" placeholder="https://pinterest.com/..." autoComplete="off" />
        <ChoiceGroup
          name="budget"
          legend="Approximate budget"
          options={BUDGET_OPTIONS}
          value={form.budget}
          onChange={(v) => onChange("budget", v)}
          required
          error={errors.budget}
          layout="chips"
        />
      </>
    );
  }

  return (
    <>
      <ChoiceGroup
        name="referral_source"
        legend="How did you hear about us?"
        options={REFERRAL_OPTIONS}
        value={form.referral_source}
        onChange={(v) => onChange("referral_source", v)}
        required
        error={errors.referral_source}
        layout="list"
      />
      <TextAreaField
        {...t("personal_story")}
        label="Your love story"
        placeholder="How did you meet? What makes your relationship special?"
        rows={4}
      />
    </>
  );
}
