import { ArrowLeft, ArrowRight, CheckCircle2, Pencil, Save } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'

import { Button } from '../components/Button'
import { Checkbox, ChoiceCard, FormError, Input, Select, Textarea } from '../components/Field'
import { Header } from '../components/Header'
import { useToast } from '../components/Toast'
import { Card, Container, Kicker, Stepper } from '../components/ui'
import { PROGRAMMES } from '../content'
import { postJson } from '../lib/api'
import { fmtDate } from '../lib/format'
import { useStore } from '../lib/store'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { COUNTRIES, FUNDING, LICENCES, MEDICAL_CLASSES, STATEMENT_MAX, STATEMENT_MIN, validateStep, type ApplicationDraft, type FieldErrors } from '../shared/validation'

const STEPS = ['Course', 'About you', 'Training', 'Statement', 'Review']
const FIELD_STEP: Record<string, number> = {
  programme: 0,
  cohort: 0,
  firstName: 1,
  lastName: 1,
  email: 1,
  phone: 1,
  country: 1,
  dob: 1,
  medicalClass: 2,
  licenceHeld: 2,
  loggedHours: 2,
  experience: 2,
  statement: 3,
  funding: 3,
  consent: 4,
}

export function Apply() {
  useDocumentTitle('Apply')
  const { draft, draftStep, updateDraft, submitApplication } = useStore()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [step, setStep] = useState(draftStep)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState<{ ref: string; programme: string; cohort: string; email: string } | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  // A link from a course page preselects it (and its intake).
  useEffect(() => {
    const programme = params.get('programme')
    const cohort = params.get('cohort')
    const p = PROGRAMMES.find((x) => x.slug === programme)
    if (p) {
      updateDraft({ programme: p.slug, cohort: p.cohorts.some((c) => c.id === cohort) ? (cohort as string) : '' }, 0)
      setStep(0)
      // Drop the query so a reload keeps the saved step instead of starting over.
      setParams({}, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof ApplicationDraft>(k: K, v: ApplicationDraft[K]) => {
    updateDraft({ [k]: v } as Partial<ApplicationDraft>)
    if (errors[k]) setErrors(({ [k]: _drop, ...rest }) => rest)
  }

  const go = (n: number) => {
    setStep(n)
    updateDraft({}, n)
    setFormError('')
    requestAnimationFrame(() => {
      headingRef.current?.focus()
      headingRef.current?.scrollIntoView({ block: 'center' })
    })
  }

  async function next(e: FormEvent) {
    e.preventDefault()
    const errs = validateStep(step, draft)
    setErrors(errs)
    if (Object.keys(errs).length) {
      setFormError('Please fix the highlighted fields to continue.')
      return
    }
    if (step < 4) return go(step + 1)
    setSending(true)
    setFormError('')
    const res = await postJson<{ ref: string }>('/api/applications', draft)
    setSending(false)
    if (!res.ok) {
      if (res.fieldErrors) {
        setErrors(res.fieldErrors)
        const first = Math.min(...Object.keys(res.fieldErrors).map((k) => FIELD_STEP[k] ?? 4))
        if (first < 4) go(first)
      }
      setFormError(res.error)
      return
    }
    const app = { ref: res.data.ref, programme: draft.programme, cohort: draft.cohort, name: `${draft.firstName} ${draft.lastName}`.trim(), email: draft.email, submittedAt: Date.now() }
    submitApplication(app)
    setDone(app)
    toast('Application submitted')
    window.scrollTo({ top: 0 })
  }

  const programme = PROGRAMMES.find((p) => p.slug === draft.programme)
  const cohort = programme?.cohorts.find((c) => c.id === draft.cohort)

  if (done) {
    const p = PROGRAMMES.find((x) => x.slug === done.programme)
    const c = p?.cohorts.find((x) => x.id === done.cohort)
    return (
      <>
        <Header />
        <section className="border-b border-line py-16 md:py-24">
          <Container className="max-w-[760px]">
            <div className="flex flex-col items-start gap-5 border border-line bg-surface p-8 md:p-10">
              <Kicker>Application received</Kicker>
              <CheckCircle2 className="size-10 text-lime-ink" aria-hidden />
              <h1 className="font-display text-[36px] leading-[1.05] tracking-[-0.015em] md:text-[46px]" tabIndex={-1} ref={(el) => el?.focus()}>
                Application received
              </h1>
              <p className="text-[16px] leading-relaxed text-muted">
                Thanks. Your reference is <strong className="figures font-mono text-fg">{done.ref}</strong>. We have sent a copy to {done.email}. Admissions will be in touch within ten working days about {p?.title}
                {c ? `, ${c.label}` : ''}.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button to="/dashboard">Track it in the student hub</Button>
                <Button to="/events" variant="secondary">
                  Book an open day
                </Button>
              </div>
            </div>
          </Container>
        </section>
      </>
    )
  }

  return (
    <>
      <Header />
      <section className="border-b border-line pb-24">
        <Container className="flex flex-col gap-3 pt-4 pb-10 md:pt-6 md:pb-14">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4 text-[11px] font-medium tracking-[0.14em] text-muted uppercase">
            <span className="inline-flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-amber" aria-hidden />
              Application
            </span>
            <span className="hidden items-center gap-2 sm:inline-flex">
              <Save className="size-3.5 text-muted" aria-hidden />
              Draft saved on this device
            </span>
          </div>
          <h1 className="max-w-[760px] font-display text-[40px] leading-[1.02] tracking-[-0.015em] md:text-[60px]">Apply to FADEC</h1>
          <p className="max-w-[56ch] text-[16px] leading-relaxed text-muted">
            Five short steps. Your medical, licences and logged hours decide which intake fits — nothing is charged until an offer is accepted.
          </p>
        </Container>

        <Container className="grid gap-8 lg:grid-cols-[1fr_340px] lg:gap-12">
          <div className="flex min-w-0 flex-col gap-6">
            <Stepper steps={STEPS} current={step} />
            <Card as="section" className="p-6 md:p-8">
              <form onSubmit={next} noValidate className="flex flex-col gap-6">
                <h2 ref={headingRef} tabIndex={-1} className="font-display text-[28px] leading-tight tracking-[-0.01em] focus:outline-none">
                  {STEPS[step]}
                </h2>

                {step === 0 && (
                  <>
                    <Select label="Course" value={draft.programme} error={errors.programme} onChange={(e) => updateDraft({ programme: e.target.value, cohort: '' })}>
                      <option value="">Choose a course</option>
                      {PROGRAMMES.map((p) => (
                        <option key={p.slug} value={p.slug}>
                          {p.title}
                        </option>
                      ))}
                    </Select>
                    {programme && (
                      <fieldset className="flex flex-col gap-3" aria-describedby={errors.cohort ? 'cohort-err' : undefined}>
                        <legend className="mb-2 text-[13.5px] font-medium">Intake</legend>
                        {programme.cohorts.map((c) => {
                          const full = c.taken >= c.seats
                          return (
                            <ChoiceCard
                              key={c.id}
                              name="cohort"
                              value={c.id}
                              checked={draft.cohort === c.id}
                              disabled={full}
                              onChange={() => set('cohort', c.id)}
                              title={`${c.label}${full ? ' (full)' : ''}`}
                              body={`Starts ${fmtDate(c.start)}, ${c.slot}`}
                            />
                          )
                        })}
                        {errors.cohort && (
                          <p id="cohort-err" className="text-[13px] text-danger">
                            {errors.cohort}
                          </p>
                        )}
                      </fieldset>
                    )}
                  </>
                )}

                {step === 1 && (
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Input label="First name" autoComplete="given-name" value={draft.firstName} error={errors.firstName} onChange={(e) => set('firstName', e.target.value)} />
                    <Input label="Last name" autoComplete="family-name" value={draft.lastName} error={errors.lastName} onChange={(e) => set('lastName', e.target.value)} />
                    <Input label="Email" type="email" autoComplete="email" value={draft.email} error={errors.email} onChange={(e) => set('email', e.target.value)} />
                    <Input label="Phone" optional type="tel" autoComplete="tel" value={draft.phone} error={errors.phone} onChange={(e) => set('phone', e.target.value)} />
                    <Select label="Country of residence" autoComplete="country-name" value={draft.country} error={errors.country} onChange={(e) => set('country', e.target.value)}>
                      <option value="">Choose a country</option>
                      {COUNTRIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </Select>
                    <Input label="Date of birth" type="date" autoComplete="bday" value={draft.dob} error={errors.dob} onChange={(e) => set('dob', e.target.value)} />
                  </div>
                )}

                {step === 2 && (
                  <div className="flex flex-col gap-5">
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Select
                        label="Medical certificate"
                        hint="Class 1 for a professional course, Class 2 for a PPL."
                        value={draft.medicalClass}
                        error={errors.medicalClass}
                        onChange={(e) => set('medicalClass', e.target.value)}
                      >
                        <option value="">Choose one</option>
                        {MEDICAL_CLASSES.map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </Select>
                      <Select label="Licence held" value={draft.licenceHeld} error={errors.licenceHeld} onChange={(e) => set('licenceHeld', e.target.value)}>
                        <option value="">Choose one</option>
                        {LICENCES.map((l) => (
                          <option key={l}>{l}</option>
                        ))}
                      </Select>
                      <Input
                        label="Logged flying hours"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={20000}
                        placeholder="0"
                        hint="Total hours in your logbook. Enter 0 if you have not flown yet."
                        className="sm:col-span-2"
                        value={draft.loggedHours}
                        error={errors.loggedHours}
                        onChange={(e) => set('loggedHours', e.target.value)}
                      />
                    </div>
                    <Textarea
                      label="Training or aviation experience"
                      optional
                      hint="Schools, cadet schemes, simulator time, or work that supports your application."
                      rows={4}
                      value={draft.experience}
                      onChange={(e) => set('experience', e.target.value)}
                    />
                  </div>
                )}

                {step === 3 && (
                  <div className="flex flex-col gap-5">
                    <Textarea
                      label="Personal statement"
                      hint={`Why this course, and why now? ${draft.statement.trim().length} of at least ${STATEMENT_MIN} characters.`}
                      maxLength={STATEMENT_MAX}
                      value={draft.statement}
                      error={errors.statement}
                      onChange={(e) => set('statement', e.target.value)}
                    />
                    <fieldset className="flex flex-col gap-2">
                      <legend className="mb-2 text-[13.5px] font-medium">How will you fund your training?</legend>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {FUNDING.map((f) => (
                          <ChoiceCard key={f.id} name="funding" value={f.id} checked={draft.funding === f.id} onChange={() => set('funding', f.id)} title={f.label} />
                        ))}
                      </div>
                    </fieldset>
                  </div>
                )}

                {step === 4 && (
                  <div className="flex flex-col gap-4">
                    <Review label="Course" onEdit={() => go(0)} value={programme ? `${programme.title}${cohort ? `, ${cohort.label}` : ''}` : 'Not chosen'} />
                    <Review label="About you" onEdit={() => go(1)} value={`${draft.firstName} ${draft.lastName}, ${draft.email}${draft.country ? `, ${draft.country}` : ''}`} />
                    <Review
                      label="Training"
                      onEdit={() => go(2)}
                      value={`${draft.medicalClass || 'No medical given'}, licence ${draft.licenceHeld || 'not given'}, ${draft.loggedHours || '0'} hours logged`}
                    />
                    <Review label="Statement" onEdit={() => go(3)} value={draft.statement ? `${draft.statement.slice(0, 160)}${draft.statement.length > 160 ? '…' : ''}` : 'Not written'} />
                    <Checkbox label="I confirm these details are accurate and agree to be contacted about my application." checked={draft.consent} error={errors.consent} onChange={(e) => set('consent', e.target.checked)} />
                  </div>
                )}

                {formError && <FormError>{formError}</FormError>}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                  {step > 0 ? (
                    <Button variant="ghost" onClick={() => go(step - 1)} icon={<ArrowLeft className="size-4" aria-hidden />}>
                      Back
                    </Button>
                  ) : (
                    <Link to="/admissions" className="inline-flex min-h-10 items-center text-[14px] text-muted hover:text-fg">
                      Entry requirements
                    </Link>
                  )}
                  <Button type="submit" loading={sending} iconRight={step < 4 ? <ArrowRight className="size-4" aria-hidden /> : undefined}>
                    {step < 4 ? 'Continue' : 'Submit application'}
                  </Button>
                </div>
              </form>
            </Card>
          </div>

          <aside className="flex flex-col gap-4 lg:pt-16">
            <div className="flex flex-col gap-3 border border-line bg-surface p-6">
              <h2 className="text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">Your choice</h2>
              {programme ? (
                <>
                  <p className="font-display text-[19px] leading-snug">{programme.title}</p>
                  <p className="text-[13.5px] text-muted">{cohort ? `${cohort.label}, ${cohort.slot}` : 'Choose an intake'}</p>
                  {cohort && <p className="figures text-[13px] text-amber-ink">Apply by {fmtDate(cohort.deadline, { day: 'numeric', month: 'long' })}</p>}
                </>
              ) : (
                <>
                  <p className="text-[14px] text-muted">Not sure yet?</p>
                  <Link to="/programmes" className="inline-flex min-h-10 items-center self-start text-[14px] text-fg underline decoration-amber decoration-1 underline-offset-4">
                    Browse courses
                  </Link>
                </>
              )}
            </div>
            <div className="flex flex-col gap-2 border-t border-line pt-4 text-[14px] text-muted">
              <h2 className="text-[11px] font-semibold tracking-[0.16em] text-fg uppercase">Need a hand?</h2>
              <p>Join an application clinic or email admissions. We reply within a working day.</p>
              <Link to="/events?type=Q%26A" className="inline-flex min-h-10 items-center self-start text-[14px] text-fg underline decoration-amber decoration-1 underline-offset-4">
                Application clinics
              </Link>
            </div>
          </aside>
        </Container>
      </section>
    </>
  )
}

function Review({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line pb-3">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-faint uppercase">{label}</span>
        <span className="text-[14.5px] leading-relaxed break-words">{value}</span>
      </div>
      <Button variant="ghost" size="sm" onClick={onEdit} icon={<Pencil className="size-3.5" aria-hidden />} aria-label={`Edit ${label.toLowerCase()}`}>
        Edit
      </Button>
    </div>
  )
}
