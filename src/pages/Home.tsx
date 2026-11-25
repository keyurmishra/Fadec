import { ArrowRight, Award, CalendarDays, UserRound, Video } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '../components/Button'
import { EVENT_TONE } from '../components/EventCard'
import { Header } from '../components/Header'
import { Hero } from '../components/Hero'
import { ProgrammeCard } from '../components/ProgrammeCard'
import { Timetable } from '../components/Timetable'
import { Badge, Container, Kicker, Reveal, SectionHeading } from '../components/ui'
import { ADMISSIONS, EVENTS, HERO, HUB_PROMO, HUB_TODAY, PILLARS, PROGRAMMES, TIMETABLE, VOICES } from '../content'
import { cx } from '../lib/cx'
import { fmtDate, mondayOf } from '../lib/format'
import { img } from '../lib/images'
import { useDocumentTitle } from '../lib/useDocumentTitle'

const PILLAR_ICON = { video: Video, calendar: CalendarDays, user: UserRound, award: Award }

const TRUST = [
  { label: 'Approvals', value: 'DGCA-aligned ground school, EASA syllabus' },
  { label: 'Simulator', value: 'A320 fixed-base device, Sim bay 1' },
  { label: 'Authority', value: 'UK CAA Approved Training Organisation 1187' },
  { label: 'Quality', value: 'ISO 9001:2015 certified since 2016' },
]

export function Home() {
  useDocumentTitle()
  const featured = PROGRAMMES.slice(0, 4)
  const nextEvents = EVENTS.slice(0, 3)
  const firstDeadline = PROGRAMMES[0].cohorts[0].deadline

  return (
    <>
      <Header />
      <Hero />

      {/* value proposition */}
      <section className="border-b border-line py-16 md:py-24">
        <Container className="grid gap-12 md:grid-cols-[1.15fr_0.85fr] md:gap-16">
          <Reveal className="flex flex-col gap-6">
            <Kicker>Why pilots train here</Kicker>
            <p className="font-display text-[28px] leading-[1.18] tracking-[-0.01em] text-balance md:text-[40px]">
              Theory is cheap. FADEC is built around the clearances, minima and decisions you will actually be
              accountable for.
            </p>
            <p className="max-w-[56ch] text-[15.5px] leading-relaxed text-muted">
              Every subject is written against a licence syllabus — DGCA, EASA or an airline SOP — and every progress
              test maps back to it. You leave with a training record an authority or an airline can follow without
              asking you to explain it.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button to={HERO.primary.to} iconRight={<ArrowRight className="size-4" aria-hidden />}>
                {HERO.primary.label}
              </Button>
              <Button to="/admissions" variant="secondary">
                Entry requirements
              </Button>
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <dl className="border-t border-line">
              {TRUST.map((t) => (
                <div key={t.label} className="grid grid-cols-[92px_1fr] gap-4 border-b border-line py-4">
                  <dt className="text-[10.5px] font-semibold tracking-[0.14em] text-faint uppercase">{t.label}</dt>
                  <dd className="text-[13.5px] leading-snug text-fg">{t.value}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </Container>
      </section>

      {/* pillars */}
      <section className="border-b border-line py-16 md:py-24">
        <Container className="flex flex-col gap-10">
          <SectionHeading
            kicker="How a cohort works"
            title="Teaching that stands up to an audit"
            body="You start on a date, with the same cohort, and move through the syllabus together — with a training captain accountable for your record."
          />
          <ul className="grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map((p, i) => {
              const Icon = PILLAR_ICON[p.icon]
              return (
                <Reveal as="li" key={p.title} delay={i * 0.05} className="h-full bg-surface">
                  <div className="flex h-full flex-col gap-4 p-6">
                    <div className="flex items-center justify-between">
                      <Icon className="size-5 text-muted" aria-hidden />
                      <span className="figures font-mono text-[11px] text-faint">{String(i + 1).padStart(2, '0')}</span>
                    </div>
                    <h3 className="font-display text-[21px] leading-tight">{p.title}</h3>
                    <p className="text-[13.5px] leading-relaxed text-muted">{p.body}</p>
                  </div>
                </Reveal>
              )
            })}
          </ul>
        </Container>
      </section>

      {/* featured courses */}
      <section className="border-b border-line py-16 md:py-24">
        <Container className="flex flex-col gap-10">
          <SectionHeading
            kicker="Catalogue"
            title="Featured courses"
            body="Licences, ratings and certificates — from a first solo to an airline type rating."
            action={
              <Button to="/programmes" variant="secondary" iconRight={<ArrowRight className="size-4" aria-hidden />}>
                All {PROGRAMMES.length} courses
              </Button>
            }
          />
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((p, i) => (
              <Reveal as="li" key={p.slug} delay={i * 0.05} className="h-full">
                <ProgrammeCard p={p} />
              </Reveal>
            ))}
          </ul>
        </Container>
      </section>

      {/* student hub */}
      <section className="border-b border-line py-16 md:py-24">
        <Container>
          <div className="grid gap-10 border border-line bg-surface p-6 md:grid-cols-[0.85fr_1.15fr] md:gap-12 md:p-10">
            <div className="flex flex-col gap-5">
              <Kicker>Student hub</Kicker>
              <h2 className="font-display text-[32px] leading-[1.06] md:text-[40px]">{HUB_PROMO.title}</h2>
              <p className="max-w-[42ch] text-[14.5px] leading-relaxed text-muted">{HUB_PROMO.body}</p>
              <ul className="mt-1 flex flex-col gap-0 border-t border-line">
                {[
                  ['Sessions', 'Live and recorded, indexed by module'],
                  ['Deadlines', 'Assessment windows published up front'],
                  ['Logbook', 'Practical tasks signed off by your mentor'],
                  ['Records', 'Transcripts and completion certificates'],
                ].map(([k, v]) => (
                  <li key={k} className="grid grid-cols-[92px_1fr] gap-4 border-b border-line py-2.5 text-[13px]">
                    <span className="text-[10.5px] font-semibold tracking-[0.14em] text-faint uppercase">{k}</span>
                    <span className="text-muted">{v}</span>
                  </li>
                ))}
              </ul>
              <Button to="/dashboard" className="mt-1 self-start" iconRight={<ArrowRight className="size-4" aria-hidden />}>
                Open the demo hub
              </Button>
            </div>
            <div className="border border-line bg-bg p-4">
              <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-line pb-2">
                <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Week view</p>
                <p className="text-[12px] text-muted">CPL, cohort 14</p>
              </div>
              <Timetable sessions={TIMETABLE} weekStart={mondayOf(HUB_TODAY)} today={HUB_TODAY} />
            </div>
          </div>
        </Container>
      </section>

      {/* trust signals / voices */}
      <section className="border-b border-line py-16 md:py-24">
        <Container className="flex flex-col gap-10">
          <SectionHeading
            kicker="Trust signals"
            title="What graduates and employers say"
            body="1,600 pilots trained since 2011, now flying in airlines, charter, survey and flight instruction."
          />
          <ul className="grid gap-px border border-line bg-line md:grid-cols-3">
            {VOICES.map((v, i) => (
              <Reveal as="li" key={v.name} delay={i * 0.05} className="h-full bg-surface">
                <figure className="flex h-full flex-col gap-6 p-6">
                  <blockquote className="font-display text-[19px] leading-[1.35] text-pretty">“{v.quote}”</blockquote>
                  <figcaption className="mt-auto flex items-center gap-3 border-t border-line pt-4">
                    <img src={img(v.image)} alt="" className="size-9 rounded-full object-cover" loading="lazy" />
                    <div className="flex flex-col">
                      <span className="text-[13px] font-medium">{v.name}</span>
                      <span className="text-[12px] text-muted">{v.role}</span>
                    </div>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </ul>
        </Container>
      </section>

      {/* admissions */}
      <section className="border-b border-line py-16 md:py-24">
        <Container className="grid gap-6 lg:grid-cols-[1.25fr_0.9fr]">
          <div className="border border-line bg-surface p-6 md:p-10">
            <Kicker>Admissions</Kicker>
            <h2 className="mt-4 font-display text-[30px] leading-[1.08] md:text-[38px]">Four steps to your first session</h2>
            <ol className="mt-8 border-t border-line">
              {ADMISSIONS.steps.map((s, i) => (
                <li key={s.title} className="grid grid-cols-[38px_1fr] gap-5 border-b border-line py-5">
                  <span className="figures font-mono text-[12px] text-amber-ink">0{i + 1}</span>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-[15px] font-semibold">{s.title}</h3>
                    <p className="max-w-[52ch] text-[13.5px] leading-relaxed text-muted">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex flex-col justify-between gap-8 bg-fg p-6 text-[#f6f3ec] md:p-10">
            <div className="flex flex-col gap-4">
              <p className="text-[10.5px] font-semibold tracking-[0.16em] text-[rgb(246_243_236/0.65)] uppercase">
                January 2027 intake
              </p>
              <h2 className="font-display text-[32px] leading-[1.05] md:text-[40px]">
                Applications close {fmtDate(firstDeadline, { day: 'numeric', month: 'long' })}
              </h2>
              <p className="max-w-[36ch] text-[14px] leading-relaxed text-[rgb(246_243_236/0.75)]">
                Cohorts are capped so simulator slots and instructor hours stay protected. Late applications are held for the next intake.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button to="/apply" variant="violet">
                Start your application
              </Button>
              <Button to="/admissions" variant="secondary">
                Fees and funding
              </Button>
            </div>
          </div>
        </Container>
      </section>

      {/* briefings */}
      <section className="py-16 md:py-24">
        <Container className="flex flex-col gap-10">
          <SectionHeading
            kicker="Briefings"
            title="Sit in on a ground-school briefing"
            action={
              <Button to="/events" variant="secondary" iconRight={<ArrowRight className="size-4" aria-hidden />}>
                All briefings
              </Button>
            }
          />
          <ul className="border-t border-line">
            {nextEvents.map((ev) => (
              <li key={ev.id}>
                <Link
                  to={`/events?type=${encodeURIComponent(ev.type)}`}
                  className="group grid gap-3 border-b border-line py-5 transition-colors hover:bg-surface md:grid-cols-[180px_1fr_auto] md:items-baseline md:gap-8"
                >
                  <div className="flex items-center gap-3">
                    <Badge tone={EVENT_TONE[ev.type]}>{ev.type}</Badge>
                    <span className="figures text-[12.5px] text-muted">
                      {fmtDate(ev.date, { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                  <h3 className="font-display text-[22px] leading-snug">{ev.title}</h3>
                  <span className={cx('inline-flex items-center gap-1.5 text-[12.5px] text-muted')}>
                    {ev.time}, {ev.length}
                    <ArrowRight className="size-3.5 text-amber-ink transition-transform group-hover:translate-x-1" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>
    </>
  )
}
