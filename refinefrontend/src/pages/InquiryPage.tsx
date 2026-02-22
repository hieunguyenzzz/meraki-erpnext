import { useState, useCallback } from "react";
import { GoogleReCaptchaProvider, useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { motion, AnimatePresence } from "framer-motion";

const RECAPTCHA_SITE_KEY = "6LddGHQsAAAAAFhiFECWxyGeM_2Skr9VZA8XYCzn";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FormData {
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

const INITIAL_FORM: FormData = {
  couple_names: "", preferred_name: "", nationalities: "",
  bride_email: "", groom_email: "", phone: "",
  wedding_date: "", location: "", location_reason: "",
  guest_count: "", out_of_town_guests: "",
  three_words: "", must_haves: "", pinterest: "",
  budget: "", referral_source: "", personal_story: "",
};

const REFERRAL_OPTIONS = ["Facebook", "Instagram", "A dear friend", "Website", "Other"];
const BUDGET_OPTIONS = [
  "Under $10,000", "$10,000 – $20,000", "$20,000 – $35,000",
  "$35,000 – $50,000", "Above $50,000",
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`gf-card ${className}`}>
      {children}
    </div>
  );
}

function QuestionLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="gf-label">
      {children}
      {required && <span className="gf-required" aria-label="required"> *</span>}
    </label>
  );
}

function TextInput({
  value, onChange, placeholder, type = "text", required
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <input
      className="gf-input"
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
    />
  );
}

function TextArea({
  value, onChange, placeholder, rows = 3, required
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  required?: boolean;
}) {
  return (
    <textarea
      className="gf-textarea"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      required={required}
    />
  );
}

function SelectInput({
  value, onChange, options, required
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  required?: boolean;
}) {
  return (
    <select
      className="gf-select"
      value={value}
      onChange={e => onChange(e.target.value)}
      required={required}
    >
      <option value="">Choose</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function RadioGroup({
  value, onChange, options
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="gf-radio-group">
      {options.map(opt => (
        <label key={opt} className={`gf-radio-item ${value === opt ? "checked" : ""}`}>
          <span className={`gf-radio-dot ${value === opt ? "active" : ""}`} />
          <input
            type="radio"
            name="referral_source"
            value={opt}
            checked={value === opt}
            onChange={() => onChange(opt)}
            className="gf-radio-hidden"
          />
          <span className="gf-radio-text">{opt}</span>
        </label>
      ))}
    </div>
  );
}

function SuccessScreen({ coupleName }: { coupleName: string }) {
  return (
    <motion.div
      className="gf-success-wrap"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <SectionCard className="gf-success-card">
        <div className="gf-success-icon">
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="24" cy="24" r="24" fill="#E8F5E9" />
            <motion.path
              d="M14 24l8 8 12-14"
              stroke="#34A853"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
            />
          </svg>
        </div>
        <h2 className="gf-success-title">Your response has been recorded.</h2>
        <p className="gf-success-sub">
          Thank you, <strong>{coupleName}</strong>. We'll be in touch within 48 hours.
        </p>
      </SectionCard>
    </motion.div>
  );
}

// ─── Main Form ───────────────────────────────────────────────────────────────

function InquiryForm() {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { executeRecaptcha } = useGoogleReCaptcha();

  function set(field: keyof FormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }));
  }

  const requiredFilled =
    form.couple_names.trim() && form.preferred_name.trim() && form.nationalities.trim() &&
    form.bride_email.trim() && form.groom_email.trim() && form.phone.trim() &&
    form.wedding_date.trim() && form.location.trim() && form.location_reason.trim() &&
    form.three_words.trim() && form.budget.trim() && form.referral_source.trim();

  const canSubmit = !!requiredFilled && !submitting;

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = executeRecaptcha
        ? await executeRecaptcha("inquiry_submit")
        : "dev-bypass";
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
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, executeRecaptcha, form]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --purple: #673AB7;
          --purple-light: #EDE7F6;
          --purple-mid: #9575CD;
          --red: #D93025;
          --text: #202124;
          --text-mid: #444746;
          --text-muted: #70757A;
          --border: #DADCE0;
          --bg: #F0EBF8;
          --card: #FFFFFF;
          --input-focus: #673AB7;
          --radius: 8px;
        }

        .gf-root {
          min-height: 100vh;
          background: var(--bg);
          font-family: 'DM Sans', sans-serif;
          color: var(--text);
          padding: 0 0 4rem;
        }

        /* Progress bar at very top */
        .gf-progress {
          height: 8px;
          background: var(--purple-light);
        }
        .gf-progress-fill {
          height: 100%;
          background: var(--purple);
          transition: width 0.4s ease;
          border-radius: 0 4px 4px 0;
        }

        /* Cards */
        .gf-card {
          background: var(--card);
          border-radius: var(--radius);
          border: 1px solid var(--border);
          box-shadow: 0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04);
          padding: 1.5rem;
          margin-bottom: 0.75rem;
        }

        /* Header card */
        .gf-header-card {
          border-top: 10px solid var(--purple);
          padding: 1.5rem 1.5rem 1.25rem;
        }
        .gf-header-card .gf-form-title {
          font-size: 1.75rem;
          font-weight: 400;
          color: var(--text);
          margin-bottom: 0.5rem;
          line-height: 1.2;
        }
        .gf-header-card .gf-form-desc {
          font-size: 0.9rem;
          color: var(--text-mid);
          line-height: 1.6;
        }
        .gf-required-note {
          font-size: 0.8rem;
          color: var(--text-muted);
          margin-top: 0.75rem;
        }
        .gf-required-note span { color: var(--red); }

        /* Section header card */
        .gf-section-card {
          border-top: 6px solid var(--purple-mid);
          padding: 1.25rem 1.5rem 1rem;
        }
        .gf-section-title {
          font-size: 1.1rem;
          font-weight: 500;
          color: var(--text);
        }

        /* Question cards */
        .gf-question {
          padding: 1.25rem 1.5rem 1.5rem;
          transition: border-left 0.15s;
        }
        .gf-question:focus-within {
          border-left: 6px solid var(--purple);
          padding-left: calc(1.5rem - 5px);
        }

        /* Labels */
        .gf-label {
          display: block;
          font-size: 0.875rem;
          font-weight: 400;
          color: var(--text);
          margin-bottom: 0.75rem;
          line-height: 1.5;
          cursor: default;
        }
        .gf-required { color: var(--red); margin-left: 2px; }

        /* Inputs */
        .gf-input, .gf-textarea, .gf-select {
          width: 100%;
          border: none;
          border-bottom: 1px solid var(--border);
          background: transparent;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.9rem;
          color: var(--text);
          padding: 0.3rem 0 0.5rem;
          outline: none;
          transition: border-color 0.15s;
          -webkit-appearance: none;
          border-radius: 0;
        }
        .gf-input:focus, .gf-textarea:focus, .gf-select:focus {
          border-bottom: 2px solid var(--input-focus);
        }
        .gf-input::placeholder, .gf-textarea::placeholder {
          color: var(--text-muted);
        }
        .gf-textarea {
          resize: none;
          display: block;
        }
        .gf-select {
          cursor: pointer;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2370757A' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 0.25rem center;
          padding-right: 1.5rem;
        }
        .gf-select option { color: var(--text); background: var(--card); }

        /* 2-col grid */
        .gf-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
        }
        @media (max-width: 560px) {
          .gf-grid-2 { grid-template-columns: 1fr; }
        }
        .gf-grid-2 .gf-question:first-child { border-radius: 0; }

        /* Radio group */
        .gf-radio-group { display: flex; flex-direction: column; gap: 0.1rem; }
        .gf-radio-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.6rem 0.5rem;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.12s;
        }
        .gf-radio-item:hover { background: var(--purple-light); }
        .gf-radio-item.checked { background: transparent; }
        .gf-radio-hidden { display: none; }
        .gf-radio-dot {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          border: 2px solid var(--text-muted);
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: border-color 0.15s;
        }
        .gf-radio-dot.active {
          border-color: var(--purple);
          border-width: 5px;
        }
        .gf-radio-text {
          font-size: 0.9rem;
          color: var(--text);
        }

        /* Actions row */
        .gf-actions {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          padding: 0.5rem 0 0;
        }
        .gf-submit {
          background: var(--purple);
          color: #fff;
          border: none;
          border-radius: 4px;
          padding: 0.65rem 1.5rem;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.15s, box-shadow 0.15s;
          letter-spacing: 0.01em;
        }
        .gf-submit:hover:not(:disabled) {
          background: #5E35B1;
          box-shadow: 0 1px 3px rgba(0,0,0,.2);
        }
        .gf-submit:disabled { opacity: 0.5; cursor: not-allowed; }
        .gf-clear {
          font-size: 0.875rem;
          color: var(--purple);
          background: none;
          border: none;
          cursor: pointer;
          padding: 0.65rem 0.75rem;
          border-radius: 4px;
          font-family: 'DM Sans', sans-serif;
          transition: background 0.12s;
        }
        .gf-clear:hover { background: var(--purple-light); }

        /* Error */
        .gf-error {
          background: #FDECEA;
          border: 1px solid #F5C6CB;
          border-radius: 4px;
          padding: 0.75rem 1rem;
          font-size: 0.85rem;
          color: #B71C1C;
        }

        /* Success */
        .gf-success-wrap { max-width: 640px; margin: 3rem auto; padding: 0 1rem; }
        .gf-success-card { text-align: left; padding: 2rem 1.5rem; }
        .gf-success-icon { margin-bottom: 1.25rem; }
        .gf-success-icon svg { width: 48px; height: 48px; }
        .gf-success-title { font-size: 1.4rem; font-weight: 400; color: var(--text); margin-bottom: 0.6rem; }
        .gf-success-sub { font-size: 0.9rem; color: var(--text-mid); line-height: 1.6; }

        /* Wrapper */
        .gf-body { max-width: 640px; margin: 0 auto; padding: 1.5rem 1rem; }

        /* Powered by note */
        .gf-footer {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-align: center;
          margin-top: 1.5rem;
        }
        .gf-footer a { color: var(--purple); text-decoration: none; }
      `}</style>

      <div className="gf-root">
        <AnimatePresence mode="wait">
          {submitted ? (
            <SuccessScreen key="success" coupleName={form.couple_names} />
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
            >
              {/* Progress bar */}
              <div className="gf-progress">
                <div
                  className="gf-progress-fill"
                  style={{ width: `${Math.round(
                    ([
                      form.couple_names, form.preferred_name, form.nationalities,
                      form.bride_email, form.groom_email, form.phone,
                      form.wedding_date, form.location, form.location_reason,
                      form.three_words, form.budget, form.referral_source,
                    ].filter(Boolean).length / 12) * 100
                  )}%` }}
                />
              </div>

              <div className="gf-body">
                {/* Header */}
                <SectionCard className="gf-header-card">
                  <h1 className="gf-form-title">Wedding Inquiry Form</h1>
                  <p className="gf-form-desc">
                    Tell us about yourselves and the day you've been dreaming of.
                    We'll get back to you within 48 hours.
                  </p>
                  <p className="gf-required-note"><span>*</span> Indicates required question</p>
                </SectionCard>

                <form onSubmit={handleSubmit} noValidate>

                  {/* ── Section 1: About You ── */}
                  <SectionCard className="gf-section-card">
                    <h2 className="gf-section-title">About You Two</h2>
                  </SectionCard>

                  <SectionCard className="gf-question">
                    <QuestionLabel required>Couple names</QuestionLabel>
                    <TextInput value={form.couple_names} onChange={set("couple_names")}
                      placeholder="e.g. Sophie & James" required />
                  </SectionCard>

                  <SectionCard className="gf-question">
                    <QuestionLabel required>How should we address you?</QuestionLabel>
                    <TextInput value={form.preferred_name} onChange={set("preferred_name")}
                      placeholder="Your preferred first name" required />
                  </SectionCard>

                  <SectionCard className="gf-question">
                    <QuestionLabel required>Nationalities</QuestionLabel>
                    <TextInput value={form.nationalities} onChange={set("nationalities")}
                      placeholder="e.g. Australian & Vietnamese" required />
                  </SectionCard>

                  <div className="gf-grid-2">
                    <SectionCard className="gf-question">
                      <QuestionLabel required>Bride's email</QuestionLabel>
                      <TextInput type="email" value={form.bride_email} onChange={set("bride_email")}
                        placeholder="bride@example.com" required />
                    </SectionCard>
                    <SectionCard className="gf-question">
                      <QuestionLabel required>Groom's email</QuestionLabel>
                      <TextInput type="email" value={form.groom_email} onChange={set("groom_email")}
                        placeholder="groom@example.com" required />
                    </SectionCard>
                  </div>

                  <SectionCard className="gf-question">
                    <QuestionLabel required>Phone number</QuestionLabel>
                    <TextInput type="tel" value={form.phone} onChange={set("phone")}
                      placeholder="Include country code" required />
                  </SectionCard>

                  {/* ── Section 2: Wedding Day ── */}
                  <SectionCard className="gf-section-card">
                    <h2 className="gf-section-title">Your Wedding Day</h2>
                  </SectionCard>

                  <div className="gf-grid-2">
                    <SectionCard className="gf-question">
                      <QuestionLabel required>Wedding date</QuestionLabel>
                      <TextInput type="date" value={form.wedding_date} onChange={set("wedding_date")} required />
                    </SectionCard>
                    <SectionCard className="gf-question">
                      <QuestionLabel required>Location / city</QuestionLabel>
                      <TextInput value={form.location} onChange={set("location")}
                        placeholder="e.g. Hoi An, Vietnam" required />
                    </SectionCard>
                  </div>

                  <SectionCard className="gf-question">
                    <QuestionLabel required>Why this location?</QuestionLabel>
                    <TextArea value={form.location_reason} onChange={set("location_reason")}
                      placeholder="What draws you to this place?" required />
                  </SectionCard>

                  <div className="gf-grid-2">
                    <SectionCard className="gf-question">
                      <QuestionLabel>Estimated guest count</QuestionLabel>
                      <TextInput value={form.guest_count} onChange={set("guest_count")}
                        placeholder="e.g. 80" />
                    </SectionCard>
                    <SectionCard className="gf-question">
                      <QuestionLabel>Out-of-town guests</QuestionLabel>
                      <TextInput value={form.out_of_town_guests} onChange={set("out_of_town_guests")}
                        placeholder="e.g. 30 from Australia" />
                    </SectionCard>
                  </div>

                  {/* ── Section 3: Your Vision ── */}
                  <SectionCard className="gf-section-card">
                    <h2 className="gf-section-title">Your Vision</h2>
                  </SectionCard>

                  <SectionCard className="gf-question">
                    <QuestionLabel required>Describe your day in 3 words</QuestionLabel>
                    <TextInput value={form.three_words} onChange={set("three_words")}
                      placeholder="e.g. Intimate, Romantic, Timeless" required />
                  </SectionCard>

                  <SectionCard className="gf-question">
                    <QuestionLabel>Must-haves for your wedding</QuestionLabel>
                    <TextArea value={form.must_haves} onChange={set("must_haves")}
                      placeholder="Flowers, music, moments — what is non-negotiable?" />
                  </SectionCard>

                  <SectionCard className="gf-question">
                    <QuestionLabel>Pinterest or inspiration board link</QuestionLabel>
                    <TextInput type="url" value={form.pinterest} onChange={set("pinterest")}
                      placeholder="https://pinterest.com/..." />
                  </SectionCard>

                  <SectionCard className="gf-question">
                    <QuestionLabel required>Approximate budget</QuestionLabel>
                    <SelectInput
                      value={form.budget}
                      onChange={v => setForm(f => ({ ...f, budget: v }))}
                      options={BUDGET_OPTIONS}
                      required
                    />
                  </SectionCard>

                  {/* ── Section 4: Getting to Know You ── */}
                  <SectionCard className="gf-section-card">
                    <h2 className="gf-section-title">Getting to Know You</h2>
                  </SectionCard>

                  <SectionCard className="gf-question">
                    <QuestionLabel required>How did you hear about us?</QuestionLabel>
                    <RadioGroup
                      value={form.referral_source}
                      onChange={v => setForm(f => ({ ...f, referral_source: v }))}
                      options={REFERRAL_OPTIONS}
                    />
                  </SectionCard>

                  <SectionCard className="gf-question">
                    <QuestionLabel>Your love story</QuestionLabel>
                    <TextArea value={form.personal_story} onChange={set("personal_story")}
                      placeholder="How did you meet? What makes your relationship special?"
                      rows={4} />
                  </SectionCard>

                  {/* ── Submit ── */}
                  <div className="gf-actions">
                    <button type="submit" className="gf-submit" disabled={!canSubmit}>
                      {submitting ? "Submitting…" : "Submit"}
                    </button>
                    <button
                      type="button"
                      className="gf-clear"
                      onClick={() => setForm(INITIAL_FORM)}
                    >
                      Clear form
                    </button>
                  </div>

                  {error && <p className="gf-error" style={{ marginTop: "1rem" }}>{error}</p>}

                  <p className="gf-footer" style={{ marginTop: "1.5rem" }}>
                    This form is protected by reCAPTCHA and the Google{" "}
                    <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>{" "}
                    and{" "}
                    <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer">Terms of Service</a>{" "}
                    apply.
                  </p>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

// ─── Export ──────────────────────────────────────────────────────────────────

export default function InquiryPage() {
  return (
    <GoogleReCaptchaProvider reCaptchaKey={RECAPTCHA_SITE_KEY}>
      <InquiryForm />
    </GoogleReCaptchaProvider>
  );
}
