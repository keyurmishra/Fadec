import { ArrowLeft, ArrowRight, Bookmark, BookmarkCheck, Check, Clock, GraduationCap, Layers, MonitorPlay, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { Button } from '../components/Button'
import { ChoiceCard, Select } from '../components/Field'
import { Header } from '../components/Header'
import { AWARD_TONE, nextOpenCohort } from '../components/ProgrammeCard'
import { Badge, Card, Container, Kicker, Segmented } from '../components/ui'
import { ADMISSIONS, PAYMENT_PLANS, PROGRAMMES, SCHOLARSHIPS, type PlanId, type ScholarshipId } from '../content'
import { cx } from '../lib/cx'
import { fmtDate, money } from '../lib/format'
import { img } from '../lib/images'
import { useStore } from '../lib/store'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { NotFound } from './NotFound'

export function ProgrammeDetail() {
  const { slug } = useParams()
  const p = PROGRAMMES.find((x) => x.slug === slug)
  if (!p) return <NotFound what="course" />
  return <Detail key={p.slug} slug={p.slug} />
}

function Detail({ slug }: { slug: string }) {
  const p = PROGRAMMES.find((x) => x.slug === slug)!
  useDocumentTitle(p.title)
  const { shortlist, toggleShortlist } = useStore()
  const saved = shortlist.includes(p.slug)
  const [stage, setStage] = useState(p.curriculum[0].label)
  const [cohortId, setCohortId] = useState(nextOpenCohort(p)?.id ?? '')
  const [plan, setPlan] = useState<PlanId>('termly')
  const [scholarship, setScholarship] = useState<ScholarshipId>('none')

  const cohort = p.cohorts.find((c) => c.id === cohortId)
  const planDef = PAYMENT_PLANS.find((x) => x.id === plan)!
  const sch = SCHOLARSHIPS.find((x) => x.id === scholarship)!
  const total = p.fee * (1 - sch.amount) * (1 - planDef.discount)
  const instalment = total / planDef.instalments
  const modules = p.curriculum.find((s) => s.label === stage)?.modules ?? []

  const facts = [
    { icon: Clock, label: 'Duration', value: p.duration },
    { icon: Layers, label: 'Course hours', value: `${p.hours} h` },
    { icon: MonitorPlay, label: 'Study mode', value: p.mode },
    { icon: Users, label: 'Study time', value: `${p.hoursPerWeek} a week` },
  ]

  return (
    <>
      <Header />

      {/* masthead */}
      <section className="border-b border-line">
        <Container className="flex flex-col gap-3 pt-4 pb-10 md:pt-6 md:pb-14">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
            <Link to="/programmes" className="inline-flex min-h-8 items-center gap-2 text-[12px] font-medium tracking-[0.14em] text-muted uppercase hover:text-fg">
              <ArrowLeft className="size-3.5" aria-hidden />
              All courses
            </Link>
            <div className="flex items-center gap-2">
              <Badge tone={AWARD_TONE[p.award]}>{p.award}</Badge>
              <Badge>{p.school}</Badge>
            </div>
          </div>

          <div className="grid gap-8 pt-2 md:grid-cols-[1.2fr_0.8fr] md:items-end md:gap-12">
            <div className="flex flex-col gap-5">
              <h1 className="font-display text-[42px] leading-[1.01] tracking-[-0.015em] text-balance md:text-[64px]">{p.title}</h1>
              <p className="max-w-[52ch] text-[16.5px] leading-relaxed text-muted text-pretty">{p.summary}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button to={`/apply?programme=${p.slug}${cohort ? `&cohort=${cohort.id}` : ''}`} size="lg" iconRight={<ArrowRight className="size-4" aria-hidden />}>
                  Apply now
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  aria-pressed={saved}
                  onClick={() => toggleShortlist(p.slug)}
                  icon={saved ? <BookmarkCheck className="size-4 text-amber-ink" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
                >
                  {saved ? 'Shortlisted' : 'Shortlist'}
                </Button>
              </div>
            </div>
            <figure className="flex flex-col gap-2">
              <div className="border border-line bg-surface-2 p-2">
                <img src={img(p.image)} alt="" className="aspect-[4/3] w-full object-cover" />
              </div>
              <figcaption className="flex items-baseline justify-between gap-4 border-t border-line pt-2 text-[12px] text-muted">
                <span>{p.lead.name}, {p.lead.role.toLowerCase()}</span>
                <span className="figures text-faint">{p.mode}</span>
              </figcaption>
            </figure>
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-5 border-t border-line pt-5 md:grid-cols-4">
            {facts.map((f) => (
              <div key={f.label} className="flex flex-col gap-1">
                <dt className="flex items-center gap-2 text-[10.5px] font-semibold tracking-[0.14em] text-faint uppercase">
                  <f.icon className="size-3.5" aria-hidden />
                  {f.label}
                </dt>
                <dd className="text-[15px]">{f.value}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <Container className="grid gap-10 py-14 pb-24 lg:grid-cols-[1fr_360px] lg:gap-12">
        <div className="flex min-w-0 flex-col gap-6">
          {/* overview */}
          <Card as="section" className="flex flex-col gap-5 p-6 md:p-8">
            <Kicker>Overview</Kicker>
            <p className="text-[16px] leading-relaxed text-pretty">{p.overview}</p>
            <h2 className="mt-2 border-t border-line pt-5 text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">You will be able to</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {p.outcomes.map((o) => (
                <li key={o} className="flex gap-3 text-[14.5px] leading-relaxed text-muted">
                  <Check className="mt-1 size-3.5 shrink-0 text-amber-ink" strokeWidth={3} aria-hidden />
                  {o}
                </li>
              ))}
            </ul>
          </Card>

          {/* curriculum */}
          <Card as="section" className="flex flex-col gap-5 p-6 md:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 id="curriculum" className="font-display text-[26px] leading-tight tracking-[-0.01em]">
                Syllabus
              </h2>
              {p.curriculum.length > 1 && <Segmented label="Syllabus stage" value={stage} onChange={setStage} options={p.curriculum.map((s) => ({ value: s.label, label: s.label }))} />}
            </div>
            <ul className="flex flex-col border-t border-line">
              {modules.map((m) => (
                <li key={m.code} className="flex items-center gap-4 border-b border-line py-3.5">
                  <span className="figures w-16 shrink-0 font-mono text-[12.5px] text-faint">{m.code}</span>
                  <span className="min-w-0 flex-1 text-[15px]">{m.title}</span>
                  <Badge tone={m.core ? 'neutral' : 'amber'} className="hidden sm:inline-flex">
                    {m.core ? 'Core' : 'Optional'}
                  </Badge>
                  <span className="figures w-14 shrink-0 text-right text-[13px] text-muted">{m.hours} h</span>
                </li>
              ))}
            </ul>
          </Card>

          {/* intakes */}
          <Card as="section" className="flex flex-col gap-5 p-6 md:p-8">
            <h2 className="font-display text-[26px] leading-tight tracking-[-0.01em]">Intakes and timetable</h2>
            <p className="text-[14px] leading-relaxed text-muted">Briefings and simulator slots run at fixed times. Each intake keeps the same slot for the whole course.</p>
            <fieldset className="flex flex-col gap-3">
              <legend className="sr-only">Choose an intake</legend>
              {p.cohorts.map((c) => {
                const left = c.seats - c.taken
                const full = left <= 0
                return (
                  <ChoiceCard
                    key={c.id}
                    name="cohort"
                    value={c.id}
                    checked={cohortId === c.id}
                    disabled={full}
                    onChange={() => setCohortId(c.id)}
                    title={`${c.label}, starts ${fmtDate(c.start, { day: 'numeric', month: 'short' })}`}
                    body={`${c.slot}. Apply by ${fmtDate(c.deadline, { day: 'numeric', month: 'short', year: 'numeric' })}.`}
                    aside={
                      <span className="flex w-24 shrink-0 flex-col items-end gap-1.5">
                        <span className={cx('figures text-[12px]', full ? 'text-amber-ink' : 'text-muted')}>{full ? 'Full' : `${left} seats left`}</span>
                        <span className="h-1 w-full overflow-hidden bg-[rgb(15_33_55/0.1)]" aria-hidden>
                          <span className={cx('block h-full', full ? 'bg-amber' : 'bg-navy')} style={{ width: `${Math.min(100, (c.taken / c.seats) * 100)}%` }} />
                        </span>
                      </span>
                    }
                  />
                )
              })}
            </fieldset>
          </Card>

          {/* requirements + lead */}
          <div className="grid gap-6 md:grid-cols-[1.3fr_1fr]">
            <Card as="section" className="flex flex-col gap-4 p-6 md:p-8">
              <h2 className="font-display text-[22px] leading-tight">Entry requirements</h2>
              <ul className="flex flex-col border-t border-line">
                {p.requirements.map((r) => (
                  <li key={r} className="flex gap-3 border-b border-line py-3 text-[14px] leading-relaxed text-muted">
                    <GraduationCap className="mt-0.5 size-4 shrink-0 text-amber-ink" aria-hidden />
                    {r}
                  </li>
                ))}
              </ul>
            </Card>
            <Card as="section" className="flex flex-col gap-4 p-6 md:p-8">
              <h2 className="font-display text-[22px] leading-tight">Course lead</h2>
              <div className="flex items-center gap-4 border-t border-line pt-4">
                <img src={img(p.lead.image)} alt="" className="size-14 rounded-full object-cover" />
                <div className="flex flex-col">
                  <span className="text-[15px] font-medium">{p.lead.name}</span>
                  <span className="text-[13px] text-muted">{p.lead.role}</span>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* fees */}
        <aside className="lg:sticky lg:top-6 lg:self-start" aria-labelledby="fees-title">
          <Card className="flex flex-col gap-5 p-6">
            <h2 id="fees-title" className="font-display text-[22px] leading-tight">
              Fees
            </h2>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Payment plan</legend>
              {PAYMENT_PLANS.map((pl) => (
                <ChoiceCard key={pl.id} name="plan" value={pl.id} checked={plan === pl.id} onChange={() => setPlan(pl.id)} title={pl.label} body={pl.note} />
              ))}
            </fieldset>
            <Select label="Bursary" value={scholarship} onChange={(e) => setScholarship(e.target.value as ScholarshipId)}>
              {SCHOLARSHIPS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                  {s.amount ? ` (${s.amount * 100}% off)` : ''}
                </option>
              ))}
            </Select>
            <div className="flex flex-col gap-2 border-t border-line pt-4" aria-live="polite">
              <div className="flex items-baseline justify-between">
                <span className="text-[12.5px] text-muted">{planDef.instalments === 1 ? 'Due before day one' : `Each of ${planDef.instalments} payments`}</span>
                <span className="figures font-display text-[28px] leading-none">{money(instalment)}</span>
              </div>
              <div className="flex justify-between pt-2 text-[13px] text-muted">
                <span>Course fee ({p.duration})</span>
                <span className="figures">{money(p.fee)}</span>
              </div>
              <div className="flex justify-between text-[13px] text-muted">
                <span>Total after bursary</span>
                <span className="figures text-fg">{money(total)}</span>
              </div>
              <div className="flex justify-between text-[13px] text-muted">
                <span>Deposit to hold a seat</span>
                <span className="figures">{money(ADMISSIONS.deposit)}</span>
              </div>
            </div>
            <Button to={`/apply?programme=${p.slug}${cohort ? `&cohort=${cohort.id}` : ''}`} size="lg" iconRight={<ArrowRight className="size-4" aria-hidden />}>
              {cohort ? `Apply for ${cohort.label}` : 'Join the waitlist'}
            </Button>
            <p className="text-[12px] leading-relaxed text-muted">Bursaries are confirmed after an offer. Ground school and simulator time are included; aircraft hours are quoted per hour.</p>
          </Card>
        </aside>
      </Container>
    </>
  )
}
