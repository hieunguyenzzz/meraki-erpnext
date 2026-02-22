import { useState, useCallback } from "react";
import { GoogleReCaptchaProvider, useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { motion, AnimatePresence } from "framer-motion";

const RECAPTCHA_SITE_KEY = "6LddGHQsAAAAAFhiFECWxyGeM_2Skr9VZA8XYCzn";

// ─── Types ─────────────────────────────────────────────────────────────────

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
  couple_names: "",
  preferred_name: "",
  nationalities: "",
  bride_email: "",
  groom_email: "",
  phone: "",
  wedding_date: "",
  location: "",
  location_reason: "",
  guest_count: "",
  out_of_town_guests: "",
  three_words: "",
  must_haves: "",
  pinterest: "",
  budget: "",
  referral_source: "",
  personal_story: "",
};

const REFERRAL_OPTIONS = [
  "Facebook",
  "Instagram",
  "A dear friend",
  "Website",
  "Other",
];

const BUDGET_OPTIONS = [
  "Under $10,000",
  "$10,000 – $20,000",
  "$20,000 – $35,000",
  "$35,000 – $50,000",
  "Above $50,000",
];

// ─── Animation variants ────────────────────────────────────────────────────

const EASE_OUT = [0.22, 1, 0.36, 1] as [number, number, number, number];

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: EASE_OUT, delay: i * 0.08 },
  }),
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

// ─── Ornament SVG ─────────────────────────────────────────────────────────

function Ornament() {
  return (
    <svg
      viewBox="0 0 320 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="ornament"
      aria-hidden="true"
    >
      <line x1="0" y1="10" x2="130" y2="10" stroke="#C4A962" strokeWidth="0.75" />
      <path
        d="M140 10 L148 4 L156 10 L148 16 Z"
        fill="none"
        stroke="#C4A962"
        strokeWidth="0.75"
      />
      <circle cx="160" cy="10" r="3" fill="#C4A962" />
      <path
        d="M164 10 L172 4 L180 10 L172 16 Z"
        fill="none"
        stroke="#C4A962"
        strokeWidth="0.75"
      />
      <line x1="190" y1="10" x2="320" y2="10" stroke="#C4A962" strokeWidth="0.75" />
    </svg>
  );
}

// ─── Success Screen ────────────────────────────────────────────────────────

function SuccessScreen({ coupleName }: { coupleName: string }) {
  return (
    <motion.div
      className="success-screen"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="success-ring-container">
        <svg viewBox="0 0 80 80" className="success-ring" aria-hidden="true">
          <circle cx="40" cy="40" r="36" fill="none" stroke="#C4A962" strokeWidth="1.5" />
          <motion.circle
            cx="40"
            cy="40"
            r="36"
            fill="none"
            stroke="#C4A962"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="226"
            initial={{ strokeDashoffset: 226 }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ duration: 1.4, ease: "easeOut", delay: 0.2 }}
          />
          <motion.path
            d="M26 40 L36 50 L54 32"
            fill="none"
            stroke="#C4A962"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 1.4 }}
          />
        </svg>
      </div>
      <h2 className="success-title">Thank You</h2>
      <p className="success-couple">{coupleName}</p>
      <p className="success-message">
        Your inquiry has been received. We will be in touch within 48 hours to
        begin crafting the day you have always imagined.
      </p>
      <div className="success-ornament">
        <Ornament />
      </div>
    </motion.div>
  );
}

// ─── Field Component ───────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}

function Field({ label, required, children, hint }: FieldProps) {
  return (
    <div className="field">
      <label className="field-label">
        {label}
        {required && <span className="required-mark" aria-hidden="true"> *</span>}
      </label>
      {hint && <p className="field-hint">{hint}</p>}
      {children}
    </div>
  );
}

// ─── Inner form (needs reCAPTCHA context) ─────────────────────────────────

function InquiryForm() {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { executeRecaptcha } = useGoogleReCaptcha();

  function set(field: keyof FormData) {
    return (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  const requiredFilled =
    form.couple_names.trim() &&
    form.preferred_name.trim() &&
    form.nationalities.trim() &&
    form.bride_email.trim() &&
    form.groom_email.trim() &&
    form.phone.trim() &&
    form.wedding_date.trim() &&
    form.location.trim() &&
    form.location_reason.trim() &&
    form.three_words.trim() &&
    form.budget.trim() &&
    form.referral_source.trim();

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
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=Lato:wght@300;400;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .inquiry-root {
          min-height: 100vh;
          background-color: #FDFAF5;
          font-family: 'Lato', sans-serif;
          color: #2C2416;
          padding: 0 1rem 5rem;
        }

        /* Hero */
        .hero {
          text-align: center;
          padding: 4rem 1rem 2rem;
          max-width: 640px;
          margin: 0 auto;
        }
        .hero-eyebrow {
          font-family: 'Lato', sans-serif;
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: #C4A962;
          margin-bottom: 1.25rem;
        }
        .hero-title {
          font-family: 'Cormorant Garamond', serif;
          font-weight: 300;
          font-size: clamp(2.4rem, 6vw, 3.6rem);
          line-height: 1.12;
          color: #2C2416;
          margin-bottom: 1.25rem;
        }
        .hero-title em {
          font-style: italic;
          color: #8B7355;
        }
        .hero-subtitle {
          font-family: 'Lato', sans-serif;
          font-size: 0.9rem;
          font-weight: 300;
          line-height: 1.8;
          color: #8B7355;
          max-width: 460px;
          margin: 0 auto 2rem;
        }

        /* Form wrapper */
        .form-wrap {
          max-width: 640px;
          margin: 0 auto;
        }

        /* Sections */
        .section {
          margin-bottom: 3rem;
        }
        .section-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 2rem;
        }
        .section-number {
          font-family: 'Cormorant Garamond', serif;
          font-size: 0.75rem;
          font-weight: 300;
          letter-spacing: 0.15em;
          color: #C4A962;
          min-width: 1.5rem;
        }
        .section-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: 1.35rem;
          font-weight: 500;
          letter-spacing: 0.04em;
          color: #2C2416;
        }
        .section-line {
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, #C4A962 0%, transparent 100%);
          opacity: 0.4;
        }

        .ornament {
          display: block;
          width: 100%;
          max-width: 320px;
          margin: 2.5rem auto;
          opacity: 0.7;
        }

        /* Grid */
        .grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.25rem;
        }
        @media (max-width: 520px) {
          .grid-2 { grid-template-columns: 1fr; }
        }
        .grid-1 { display: grid; gap: 1.25rem; }

        /* Fields */
        .field { display: flex; flex-direction: column; gap: 0.45rem; }
        .field-label {
          font-family: 'Lato', sans-serif;
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #8B7355;
        }
        .field-hint {
          font-size: 0.78rem;
          color: #B0996E;
          font-weight: 300;
          font-style: italic;
          margin-top: -0.2rem;
        }
        .required-mark { color: #C4A962; }

        input[type="text"],
        input[type="email"],
        input[type="tel"],
        input[type="url"],
        input[type="date"],
        textarea {
          width: 100%;
          background: #FAF7F0;
          border: 1px solid #E2D9C8;
          border-radius: 2px;
          padding: 0.75rem 1rem;
          font-family: 'Lato', sans-serif;
          font-size: 0.9rem;
          font-weight: 300;
          color: #2C2416;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
          -webkit-appearance: none;
        }
        input:focus,
        textarea:focus {
          border-color: #C4A962;
          box-shadow: 0 0 0 3px rgba(196, 169, 98, 0.12);
        }
        input::placeholder,
        textarea::placeholder {
          color: #C5B99B;
          font-weight: 300;
        }
        textarea {
          resize: vertical;
          min-height: 100px;
        }

        /* Pill buttons (referral source) */
        .pills {
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem;
        }
        .pill {
          padding: 0.45rem 1.1rem;
          border-radius: 99px;
          border: 1px solid #E2D9C8;
          background: #FAF7F0;
          font-family: 'Lato', sans-serif;
          font-size: 0.8rem;
          font-weight: 400;
          color: #8B7355;
          cursor: pointer;
          transition: all 0.18s;
          letter-spacing: 0.02em;
        }
        .pill:hover {
          border-color: #C4A962;
          color: #C4A962;
        }
        .pill.active {
          background: #C4A962;
          border-color: #C4A962;
          color: #fff;
        }

        /* reCAPTCHA wrapper */
        .recaptcha-wrap {
          display: flex;
          justify-content: center;
          margin: 2rem 0 1.5rem;
          padding: 1.5rem;
          border: 1px solid #E2D9C8;
          border-radius: 2px;
          background: #FAF7F0;
        }

        /* Submit */
        .submit-btn {
          display: block;
          width: 100%;
          padding: 1.05rem 2rem;
          background: linear-gradient(135deg, #C4A962 0%, #B08D3C 100%);
          border: none;
          border-radius: 2px;
          font-family: 'Lato', sans-serif;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #fff;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transition: opacity 0.2s, transform 0.15s;
        }
        .submit-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          transform: none;
        }
        .submit-btn:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(196, 169, 98, 0.35);
        }
        .submit-btn:not(:disabled):active {
          transform: translateY(0);
        }
        .submit-btn::after {
          content: '';
          position: absolute;
          top: 0; left: -100%;
          width: 60%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
          transform: skewX(-20deg);
          transition: left 0.5s;
        }
        .submit-btn:not(:disabled):hover::after {
          left: 160%;
        }

        /* Error */
        .error-msg {
          margin-top: 1rem;
          padding: 0.85rem 1rem;
          background: #FDF2F0;
          border: 1px solid #E8C4BC;
          border-radius: 2px;
          font-size: 0.85rem;
          color: #A0402E;
          text-align: center;
        }

        /* Success */
        .success-screen {
          max-width: 520px;
          margin: 5rem auto;
          text-align: center;
          padding: 0 1.5rem;
        }
        .success-ring-container {
          width: 80px;
          height: 80px;
          margin: 0 auto 2rem;
        }
        .success-ring { width: 100%; height: 100%; }
        .success-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: 2.8rem;
          font-weight: 300;
          color: #2C2416;
          margin-bottom: 0.5rem;
        }
        .success-couple {
          font-family: 'Cormorant Garamond', serif;
          font-size: 1.25rem;
          font-style: italic;
          color: #C4A962;
          margin-bottom: 1.5rem;
        }
        .success-message {
          font-family: 'Lato', sans-serif;
          font-size: 0.9rem;
          font-weight: 300;
          line-height: 1.85;
          color: #8B7355;
        }
        .success-ornament { margin-top: 2.5rem; }

        /* Footer note */
        .footer-note {
          text-align: center;
          font-size: 0.72rem;
          color: #B0996E;
          font-weight: 300;
          margin-top: 1.5rem;
          letter-spacing: 0.04em;
        }
      `}</style>

      <div className="inquiry-root">
        <AnimatePresence mode="wait">
          {submitted ? (
            <SuccessScreen key="success" coupleName={form.couple_names} />
          ) : (
            <motion.div
              key="form"
              initial="hidden"
              animate="visible"
              variants={stagger}
            >
              {/* Hero */}
              <motion.header className="hero" variants={fadeUp} custom={0}>
                <p className="hero-eyebrow">Meraki Wedding Planner</p>
                <h1 className="hero-title">
                  Begin Your <em>Story</em> With Us
                </h1>
                <p className="hero-subtitle">
                  Every love story is unique. Tell us about yours and we will
                  design a day that is unmistakably, beautifully yours.
                </p>
                <Ornament />
              </motion.header>

              {/* Form */}
              <form className="form-wrap" onSubmit={handleSubmit} noValidate>
                {/* Section 1: About You Two */}
                <motion.div className="section" variants={fadeUp} custom={1}>
                  <div className="section-header">
                    <span className="section-number">01</span>
                    <h2 className="section-title">About You Two</h2>
                    <div className="section-line" />
                  </div>
                  <div className="grid-2">
                    <Field label="Couple Names" required>
                      <input
                        type="text"
                        placeholder="e.g. Sophie & James"
                        value={form.couple_names}
                        onChange={set("couple_names")}
                        required
                      />
                    </Field>
                    <Field label="Preferred Name" required hint="How should we address you?">
                      <input
                        type="text"
                        placeholder="e.g. Sophie"
                        value={form.preferred_name}
                        onChange={set("preferred_name")}
                        required
                      />
                    </Field>
                    <Field label="Nationalities" required>
                      <input
                        type="text"
                        placeholder="e.g. Australian & French"
                        value={form.nationalities}
                        onChange={set("nationalities")}
                        required
                      />
                    </Field>
                    <Field label="Phone" required>
                      <input
                        type="tel"
                        placeholder="+84 or international"
                        value={form.phone}
                        onChange={set("phone")}
                        required
                      />
                    </Field>
                    <Field label="Bride's Email" required>
                      <input
                        type="email"
                        placeholder="bride@example.com"
                        value={form.bride_email}
                        onChange={set("bride_email")}
                        required
                      />
                    </Field>
                    <Field label="Groom's Email" required>
                      <input
                        type="email"
                        placeholder="groom@example.com"
                        value={form.groom_email}
                        onChange={set("groom_email")}
                        required
                      />
                    </Field>
                  </div>
                </motion.div>

                <Ornament />

                {/* Section 2: Your Wedding Day */}
                <motion.div className="section" variants={fadeUp} custom={2}>
                  <div className="section-header">
                    <span className="section-number">02</span>
                    <h2 className="section-title">Your Wedding Day</h2>
                    <div className="section-line" />
                  </div>
                  <div className="grid-1">
                    <div className="grid-2">
                      <Field label="Wedding Date" required>
                        <input
                          type="date"
                          value={form.wedding_date}
                          onChange={set("wedding_date")}
                          required
                        />
                      </Field>
                      <Field label="Location / City" required>
                        <input
                          type="text"
                          placeholder="e.g. Hoi An, Vietnam"
                          value={form.location}
                          onChange={set("location")}
                          required
                        />
                      </Field>
                    </div>
                    <Field label="Why this location?" required>
                      <textarea
                        placeholder="What draws you to this place for your wedding day?"
                        value={form.location_reason}
                        onChange={set("location_reason")}
                        required
                        rows={3}
                      />
                    </Field>
                    <div className="grid-2">
                      <Field label="Estimated Guest Count">
                        <input
                          type="text"
                          placeholder="e.g. 80"
                          value={form.guest_count}
                          onChange={set("guest_count")}
                        />
                      </Field>
                      <Field label="Out-of-town Guests">
                        <input
                          type="text"
                          placeholder="e.g. 30 flying in from Australia"
                          value={form.out_of_town_guests}
                          onChange={set("out_of_town_guests")}
                        />
                      </Field>
                    </div>
                  </div>
                </motion.div>

                <Ornament />

                {/* Section 3: Your Vision */}
                <motion.div className="section" variants={fadeUp} custom={3}>
                  <div className="section-header">
                    <span className="section-number">03</span>
                    <h2 className="section-title">Your Vision</h2>
                    <div className="section-line" />
                  </div>
                  <div className="grid-1">
                    <Field label="Describe your day in 3 words" required>
                      <input
                        type="text"
                        placeholder="e.g. Intimate, Romantic, Timeless"
                        value={form.three_words}
                        onChange={set("three_words")}
                        required
                      />
                    </Field>
                    <Field label="Must-haves for your wedding">
                      <textarea
                        placeholder="Flowers, music, moments — what is non-negotiable for you?"
                        value={form.must_haves}
                        onChange={set("must_haves")}
                        rows={3}
                      />
                    </Field>
                    <div className="grid-2">
                      <Field label="Pinterest or Inspiration Board">
                        <input
                          type="url"
                          placeholder="https://pinterest.com/..."
                          value={form.pinterest}
                          onChange={set("pinterest")}
                        />
                      </Field>
                      <Field label="Approximate Budget" required>
                        <select
                          className="select-field"
                          value={form.budget}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, budget: e.target.value }))
                          }
                          required
                          style={{
                            width: "100%",
                            background: "#FAF7F0",
                            border: "1px solid #E2D9C8",
                            borderRadius: "2px",
                            padding: "0.75rem 1rem",
                            fontFamily: "'Lato', sans-serif",
                            fontSize: "0.9rem",
                            fontWeight: 300,
                            color: form.budget ? "#2C2416" : "#C5B99B",
                            outline: "none",
                            WebkitAppearance: "none",
                            cursor: "pointer",
                          }}
                        >
                          <option value="" disabled>
                            Select a range
                          </option>
                          {BUDGET_OPTIONS.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  </div>
                </motion.div>

                <Ornament />

                {/* Section 4: Getting to Know You */}
                <motion.div className="section" variants={fadeUp} custom={4}>
                  <div className="section-header">
                    <span className="section-number">04</span>
                    <h2 className="section-title">Getting to Know You</h2>
                    <div className="section-line" />
                  </div>
                  <div className="grid-1">
                    <Field label="How did you hear about us?" required>
                      <div className="pills">
                        {REFERRAL_OPTIONS.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            className={`pill${form.referral_source === opt ? " active" : ""}`}
                            onClick={() =>
                              setForm((f) => ({ ...f, referral_source: opt }))
                            }
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </Field>
                    <Field label="Your love story" hint="Optional — share anything you'd like us to know">
                      <textarea
                        placeholder="How did you meet? What makes your relationship special? Any meaningful details about the journey so far..."
                        value={form.personal_story}
                        onChange={set("personal_story")}
                        rows={5}
                      />
                    </Field>
                  </div>
                </motion.div>

                {/* Submit */}
                <motion.div variants={fadeUp} custom={5}>
                  <button
                    type="submit"
                    className="submit-btn"
                    disabled={!canSubmit}
                  >
                    {submitting ? "Sending your inquiry…" : "Send My Inquiry"}
                  </button>

                  {error && <p className="error-msg">{error}</p>}

                  <p className="footer-note">
                    We respect your privacy. Your details are used solely to
                    respond to your inquiry.
                  </p>
                </motion.div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

// ─── Public export wrapped with reCAPTCHA v3 provider ─────────────────────

export default function InquiryPage() {
  return (
    <GoogleReCaptchaProvider reCaptchaKey={RECAPTCHA_SITE_KEY}>
      <InquiryForm />
    </GoogleReCaptchaProvider>
  );
}
