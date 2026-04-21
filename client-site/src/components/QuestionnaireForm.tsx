import { useState, FormEvent, ChangeEvent } from 'react'

interface FormData {
  couple_names: string
  nationalities: string
  email: string
  phone: string
  wedding_date: string
  location: string
  guest_count: string
  events: string[]
  priorities: string
  pinterest: string
  budget: string
  referral_sources: string[]
  referral_other: string
  stories: string
}

const EVENTS = [
  'Tea ceremony',
  'Pre-wedding Photoshoot',
  'After Party',
  'Buddhist Wedding',
  'Welcome dinner',
  'Farewell Brunch',
]

const REFERRAL_SOURCES = [
  'Facebook',
  'Instagram',
  'A dear friend of yours',
  'Website',
]

const initialForm: FormData = {
  couple_names: '',
  nationalities: '',
  email: '',
  phone: '',
  wedding_date: '',
  location: '',
  guest_count: '',
  events: [],
  priorities: '',
  pinterest: '',
  budget: '',
  referral_sources: [],
  referral_other: '',
  stories: '',
}

export default function QuestionnaireForm() {
  const [form, setForm] = useState<FormData>(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const set = (field: keyof FormData) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  const toggleCheckbox = (field: 'events' | 'referral_sources', value: string) => {
    setForm(f => {
      const arr = f[field]
      return { ...f, [field]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] }
    })
  }

  const autoResize = (e: ChangeEvent<HTMLTextAreaElement>) => {
    e.target.style.height = ''
    e.target.style.height = e.target.scrollHeight + 'px'
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setStatus(null)
    try {
      const res = await fetch('/api/client-questionnaire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Submission failed' }))
        throw new Error(err.detail || 'Submission failed')
      }
      setStatus({ type: 'success', message: 'Thank you! Your questionnaire has been submitted successfully.' })
      setForm(initialForm)
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Something went wrong' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="header-hero" />

      <div className="header-text">
        <h1>Client Questionnaire</h1>
        <span className="brand">Meraki Wedding Planner</span>
      </div>

      <form className="form-container" onSubmit={handleSubmit}>
        {/* Names */}
        <div className="question-box">
          <span className="label-text">
            Bride and Groom's Names<span className="required-star">*</span>
          </span>
          <input type="text" className="input-line" placeholder="Your answer" required
            value={form.couple_names} onChange={set('couple_names')} />
        </div>

        {/* Nationalities */}
        <div className="question-box">
          <span className="label-text">
            Bride and Groom's Nationalities<span className="required-star">*</span>
          </span>
          <input type="text" className="input-line" placeholder="Your answer" required
            value={form.nationalities} onChange={set('nationalities')} />
        </div>

        {/* Email */}
        <div className="question-box">
          <span className="label-text">
            Bride and Groom's Emails<span className="required-star">*</span>
          </span>
          <input type="email" className="input-line" placeholder="Your answer" required
            value={form.email} onChange={set('email')} />
        </div>

        {/* Phone */}
        <div className="question-box">
          <span className="label-text">
            Bride or Groom's Phone number<span className="required-star">*</span>
          </span>
          <input type="tel" className="input-line" placeholder="Your answer" required
            value={form.phone} onChange={set('phone')} />
        </div>

        {/* Wedding Date */}
        <div className="question-box">
          <span className="label-text">
            Your wedding date<span className="required-star">*</span>
          </span>
          <input type="text" className="input-line" placeholder="Your answer" required
            value={form.wedding_date} onChange={set('wedding_date')} />
        </div>

        {/* Location */}
        <div className="question-box">
          <span className="label-text">
            Wedding location<span className="required-star">*</span>
          </span>
          <input type="text" className="input-line" placeholder="Your answer" required
            value={form.location} onChange={set('location')} />
        </div>

        {/* Guest Count */}
        <div className="question-box">
          <span className="label-text">
            Number of guests<span className="required-star">*</span>
          </span>
          <input type="text" className="input-line" placeholder="Your answer" required
            value={form.guest_count} onChange={set('guest_count')} />
        </div>

        {/* Events */}
        <div className="question-box">
          <span className="label-text">
            Which events would you like to include beside wedding ceremony?
            <span className="required-star">*</span>
          </span>
          <div className="checkbox-grid">
            {EVENTS.map(evt => (
              <label className="checkbox-item" key={evt}>
                <input type="checkbox" checked={form.events.includes(evt)}
                  onChange={() => toggleCheckbox('events', evt)} />
                <span>{evt}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Priorities */}
        <div className="question-box">
          <span className="label-text">
            What matters most to you for your wedding?<span className="required-star">*</span>
          </span>
          <span className="example-text">
            For example: Meaningful/emotional moments, visual/ decoration, guest experience,
            photography/ videography, cultural traditions, music, food &amp; drinks, etc
          </span>
          <textarea className="input-line" placeholder="Your answer" required
            value={form.priorities} onChange={e => { set('priorities')(e); autoResize(e) }}
            onInput={e => autoResize(e as unknown as ChangeEvent<HTMLTextAreaElement>)} />
        </div>

        {/* Pinterest */}
        <div className="question-box">
          <span className="label-text">If you have a Pinterest board, please link it here</span>
          <input type="url" className="input-line" placeholder="Your answer"
            value={form.pinterest} onChange={set('pinterest')} />
        </div>

        {/* Budget */}
        <div className="question-box">
          <span className="label-text">
            What is your wedding budget?<span className="required-star">*</span>
          </span>
          <span className="example-text">
            Though our service fee is not based on the percentage of your budget; it is essential to
            determine if your level of assistance required will fit in your budget.
          </span>
          <input type="text" className="input-line" placeholder="Your answer" required
            value={form.budget} onChange={set('budget')} />
        </div>

        {/* Referral */}
        <div className="question-box">
          <span className="label-text">
            How do you know about us?<span className="required-star">*</span>
          </span>
          <div className="checkbox-grid">
            {REFERRAL_SOURCES.map(src => (
              <label className="checkbox-item" key={src}>
                <input type="checkbox" checked={form.referral_sources.includes(src)}
                  onChange={() => toggleCheckbox('referral_sources', src)} />
                <span>{src}</span>
              </label>
            ))}
            <label className="checkbox-item">
              <input type="checkbox" checked={form.referral_sources.includes('Other')}
                onChange={() => toggleCheckbox('referral_sources', 'Other')} />
              <span>Other:</span>
              <input type="text" className="other-input" placeholder=""
                value={form.referral_other} onChange={set('referral_other')} />
            </label>
          </div>
        </div>

        {/* Stories */}
        <div className="question-box">
          <span className="label-text">
            If there are any touching, funny or revealing stories about the two of you that you
            think might be helpful to us in getting to know you &amp; making your wedding uniquely
            yours, please feel free to share with us here.
          </span>
          <textarea className="input-line" placeholder="Your answer"
            value={form.stories} onChange={e => { set('stories')(e); autoResize(e) }}
            onInput={e => autoResize(e as unknown as ChangeEvent<HTMLTextAreaElement>)} />
        </div>

        <button type="submit" className="submit-btn" disabled={submitting}>
          {submitting ? 'Sending...' : 'Submit'}
        </button>

        {status && (
          <div className={`submit-status ${status.type}`}>{status.message}</div>
        )}
      </form>

      <div className="footer-thankyou">
        Thank you for contacting us - we will get back to you soon!
      </div>
    </>
  )
}
